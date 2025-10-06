import { Router } from 'express';
import 'dotenv/config';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { pool } from './db.js';
import { sendTelegram } from './notify.js';

export const authRouter = Router();

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
