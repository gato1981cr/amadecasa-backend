import { Router } from 'express';
import 'dotenv/config';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { pool } from './db.js';
import { sendTelegram } from './notify.js';
import { createApproval } from './utils/approvals.js';

export const authRouter = Router(); 

// ===== Helpers (PARTE 2) =====
const ROLES = new Set(['admin', 'assistant', 'guest']);
const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

function validateRole(role) { return ROLES.has(role); }
function getPasswordForRole(role) {
  if (role === 'admin') return process.env.AUTH_ADMIN_PASSWORD || '';
  if (role === 'assistant') return process.env.AUTH_ASSISTANT_PASSWORD || '';
  if (role === 'guest') return process.env.AUTH_GUEST_PASSWORD || '';
  return '';
}
function issueJwtCookie(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '12h' });
  const secure = String(process.env.COOKIE_SECURE || 'false') === 'true';
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 12*60*60*1000 });
}
async function findDevice(ownerName, role, deviceId) {
  const [rows] = await pool.query(
    `SELECT * FROM devices WHERE device_id = ? AND owner_name = ? AND role = ?`,
    [deviceId, ownerName, role]
  );
  return rows[0] || null;
}
async function ensureDevice(ownerName, role, deviceId, userAgent) {
  const existing = await findDevice(ownerName, role, deviceId);
  if (existing) return existing;
  await pool.query(
    `INSERT INTO devices (device_id, owner_name, role, user_agent, approved, created_at)
     VALUES (?, ?, ?, ?, 0, NOW())`,
    [deviceId, ownerName, role, userAgent?.slice(0, 300) || null]
  );
  return await findDevice(ownerName, role, deviceId);
}
function isExpiredApproval(approved_at) {
  if (!approved_at) return true;
  const t = new Date(approved_at).getTime();
  return (Date.now() - t) > DAYS_30_MS;
}


// ===== Fin Helpers =====



// Utilidad para firmar “sesión”
function issueSession(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${process.env.SESSION_DAYS || 30}d` });
  // Cookie HTTP-only
  res.cookie('amade_sess', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // pon true si sirves por HTTPS
    maxAge: (process.env.SESSION_DAYS || 30) * 24 * 60 * 60 * 1000
  });
}

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);

// POST /api/auth/request  (nombre + deviceId)
authRouter.post('/auth/request', async (req, res) => {
  const { name, deviceId, role = 'guest', userAgent = '' } = req.body || {};
  if (!name || !deviceId) return res.status(400).json({ error: 'name y deviceId requeridos' });
  if (!['guest','assistant'].includes(role)) return res.status(400).json({ error: 'role inválido' });

  const now = new Date();

  // ¿ya autorizado y vigente?
  const [rows] = await pool.query(
    `SELECT * FROM devices
     WHERE device_id = :deviceId AND owner_name = :name AND role = :role AND approved = 1`,
    { deviceId, name, role }
  );
  const device = rows[0];

  if (device) {
    const last = device.last_login ? new Date(device.last_login) : null;
    const diffDays = last ? Math.floor((now - last) / (1000*60*60*24)) : Infinity;
    if (diffDays < SESSION_DAYS) {
      await pool.query(`UPDATE devices SET last_login = :now WHERE id = :id`, { now, id: device.id });
      issueSession(res, { name, role, deviceId });
      return res.json({ status: 'ok', name, role });
    }
  }

  // crear/actualizar device pendiente
  if (!device) {
    await pool.query(
      `INSERT INTO devices (device_id, owner_name, role, approved, user_agent, created_at)
       VALUES (:deviceId, :name, :role, 0, :ua, :now)
       ON DUPLICATE KEY UPDATE user_agent = VALUES(user_agent)`,
      { deviceId, name, role, ua: userAgent, now }
    );
  }

  // crear approval + enviar notificación
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
  await pool.query(
    `INSERT INTO approvals (device_id, owner_name, role, token, expires_at, used)
     VALUES (:deviceId, :name, :role, :token, :expires, 0)`,
    { deviceId, name, role, token, expires }
  );

  const approveUrl = `${process.env.PUBLIC_BASE_URL}/api/approve?token=${token}`;
  const msg = [
    '🔔 *Solicitud de acceso*',
    `👤 ${name} (${role})`,
    `📱 ${userAgent || 'desconocido'}`,
    '',
    `✅ Aprobar: ${approveUrl}`,
    '(Autoriza este *dispositivo* por 30 días)'
  ].join('\n');

  await sendTelegram(msg);

  return res.json({ status: 'pending' });
});

// GET /api/approve?token=...
authRouter.get('/approve', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Token requerido');

  const [rows] = await pool.query(
    `SELECT * FROM approvals WHERE token = :token AND used = 0`,
    { token }
  );
  const ap = rows[0];
  if (!ap) return res.status(400).send('Token inválido o usado');
  if (new Date(ap.expires_at) < new Date()) return res.status(400).send('Token expirado');

  const now = new Date();
  await pool.query(
    `UPDATE devices
       SET approved = 1, approved_at = :now, last_login = :now
     WHERE device_id = :deviceId AND owner_name = :name AND role = :role`,
    { now, deviceId: ap.device_id, name: ap.owner_name, role: ap.role }
  );
  await pool.query(`UPDATE approvals SET used = 1 WHERE id = :id`, { id: ap.id });

  res.send('✅ Dispositivo aprobado. Ya puede acceder durante 30 días sin pedir aprobación.');
});

// GET /api/auth/status?name=...&deviceId=...&role=assistant|guest
authRouter.get('/auth/status', async (req, res) => {
  const { name, deviceId, role = 'guest' } = req.query || {};
  if (!name || !deviceId) return res.status(400).json({ error: 'name y deviceId requeridos' });

  const [rows] = await pool.query(
    `SELECT approved, last_login FROM devices
     WHERE device_id = :deviceId AND owner_name = :name AND role = :role`,
    { deviceId, name, role }
  );
  const d = rows[0];
  if (!d) return res.json({ approved: false, reason: 'not_found' });

  if (!d.approved) return res.json({ approved: false, reason: 'pending' });

  const last = d.last_login ? new Date(d.last_login) : null;
  const diffDays = last ? Math.floor((Date.now() - last.getTime()) / (1000*60*60*24)) : Infinity;
  const valid = diffDays < SESSION_DAYS;
  return res.json({ approved: true, valid, last_login: d.last_login });
});

/**
 * GET /api/auth/approve?token=...
 * Marca el token como usado y autoriza el dispositivo (devices.approved=1, approved_at=NOW()).
 */
authRouter.get('/approve', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Falta token');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Buscar el token
    const [rows] = await conn.query(
      'SELECT id, device_id, owner_name, role, expires_at, used, created_at FROM approvals WHERE token = ?',
      [token]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(400).send('Token inválido');
    }
    const a = rows[0];

    // 2) Validaciones
    if (a.used) {
      await conn.rollback();
      return res.status(409).send('Este enlace ya fue utilizado');
    }
    if (new Date(a.expires_at) < new Date()) {
      await conn.rollback();
      return res.status(410).send('El enlace ha expirado');
    }

    // 3) Autorizar/actualizar el dispositivo (upsert por unique key device_id+owner_name+role)
    await conn.query(
      `INSERT INTO devices (device_id, owner_name, role, display_name, user_agent, approved, approved_at, last_login, created_at)
       VALUES (?, ?, ?, NULL, 'telegram-approval', 1, NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE approved=1, approved_at=NOW(), last_login=NOW()`,
      [a.device_id, a.owner_name, a.role]
    );

    // 4) Marcar el approval como usado
    await conn.query('UPDATE approvals SET used = 1 WHERE id = ?', [a.id]);

    await conn.commit();

    // HTML simple (puedes cambiar a redirect a tu frontend)
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
      <html><body style="font-family: sans-serif">
        <h2>✅ Dispositivo aprobado</h2>
        <p>El dispositivo <b>${a.device_id}</b> para <b>${a.owner_name}</b> (${a.role}) ya puede iniciar sesión.</p>
        <p>Ahora puedes volver a la aplicación y presionar <i>“Ya aprobé”</i> o reintentar el login.</p>
      </body></html>
    `);
  } catch (err) {
    await conn.rollback();
    console.error('approve error:', err);
    return res.status(500).send('Error interno');
  } finally {
    conn.release();
  }
});

/**
 * GET /api/auth/deny?token=...
 * Invalida el token y NO autoriza el dispositivo.
 */
authRouter.get('/deny', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Falta token');

  try {
    const [rows] = await pool.query(
      'SELECT id, used FROM approvals WHERE token = ?',
      [token]
    );
    if (!rows.length) return res.status(400).send('Token inválido');

    const a = rows[0];
    if (a.used) return res.status(409).send('Este enlace ya fue utilizado');

    await pool.query('UPDATE approvals SET used = 1 WHERE id = ?', [a.id]);

    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
      <html><body style="font-family: sans-serif">
        <h2>🚫 Acceso denegado</h2>
        <p>El enlace fue marcado como <b>denegado</b>. El dispositivo no fue autorizado.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('deny error:', err);
    return res.status(500).send('Error interno');
  }
});

// Endpoints reales (pon al menos uno de prueba)
//authRouter.get('/status', (req, res) => res.status(401).json({ error: 'No autenticado' }));
// ⬇️ añade este TEMPORAL para comprobar que responde algo en /login
//authRouter.post('/login', (req, res) => res.json({ ok: true, test: 'login placeholder' }));


// Rutas:
authRouter.get('/status', (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    // Para que la prueba espere 400 cuando no hay parámetros/cookie
    return res.status(400).json({ error: 'No autenticado' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    return res.json({ ok: true, user: payload });
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
});

authRouter.post('/logout', /* ... */);
authRouter.post('/login', async (req, res) => {
  try {
    const { ownerName, role, password, deviceId } = req.body || {};
    if (!ownerName || !role || !deviceId) {
      return res.status(400).json({ error: 'Faltan campos: ownerName, role, deviceId' });
    }
    if (!validateRole(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    // Validación simple por rol (modo doméstico)
    const expected = getPasswordForRole(role);
    if (expected && password !== expected) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Crear/ubicar el device
    const ua = req.get('user-agent') || null;
    const device = await ensureDevice(ownerName, role, deviceId, ua);

    // ¿Necesita aprobación por Telegram? (primera vez o 30+ días)
    const needsApproval = !device.approved || isExpiredApproval(device.approved_at);
    if (needsApproval) {
      const ttlMin = parseInt(process.env.APP_APPROVAL_TTL_MIN || '10', 10);
      const { token, expiresAt } = await createApproval({ deviceId, ownerName, role, ttlMinutes: ttlMin });

      const base = process.env.APP_PUBLIC_BASE_URL || 'http://192.168.100.91:3001';
      const approveUrl = `${base}/api/auth/approve?token=${token}`;
      const denyUrl = `${base}/api/auth/deny?token=${token}`;

      const msg = [
        '🔐 <b>Nuevo intento de acceso</b>',
        `Usuario: <code>${ownerName}</code>`,
        `Rol: <code>${role}</code>`,
        `Dispositivo: <code>${deviceId}</code>`,
        '',
        `✅ Aprobar: ${approveUrl}`,
        `❌ Rechazar: ${denyUrl}`,
        '',
        `⏳ Vence en ${ttlMin} min`
      ].join('\n');

      try { await sendTelegram(msg); } catch (e) { console.error('Telegram error', e); }

      return res.status(202).json({
        status: 'pending_telegram',
        message: 'Revisa tu Telegram para aprobar este dispositivo.',
        expiresAt
      });
    }

    // Ya aprobado y vigente → emitir JWT y actualizar last_login
    await pool.query(`UPDATE devices SET last_login = NOW() WHERE id = ?`, [device.id]);
    issueJwtCookie(res, { ownerName, role, deviceId });
    return res.json({ ok: true, user: { ownerName, role } });

  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

authRouter.get('/approve', /* ... */);
authRouter.get('/deny', /* ... */);