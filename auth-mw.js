import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);

export function requireAssistOrGuest(req, res, next) {
  try {
    const token = req.cookies?.amade_sess;
    if (!token) return res.status(401).json({ error: 'No auth' });

    const session = jwt.verify(token, process.env.JWT_SECRET);
    if (!['assistant','guest'].includes(session.role)) {
      return res.status(403).json({ error: 'Rol inválido' });
    }

    req.session = session; // { name, role, deviceId }
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
}

// (opcional) Forzar que el device siga siendo válido (<30 días)
export async function enforceDeviceFreshness(req, res, next) {
  const { deviceId, name, role } = req.session || {};
  if (!deviceId || !name) return res.status(401).json({ error: 'Sesión incompleta' });

  const [rows] = await pool.query(
    `SELECT approved, last_login FROM devices
     WHERE device_id = :deviceId AND owner_name = :name AND role = :role`,
    { deviceId, name, role }
  );
  const d = rows[0];
  if (!d || !d.approved) return res.status(401).json({ error: 'Dispositivo no aprobado' });

  const last = d.last_login ? new Date(d.last_login) : null;
  const diffDays = last ? Math.floor((Date.now() - last.getTime()) / (1000*60*60*24)) : Infinity;
  if (diffDays >= SESSION_DAYS) return res.status(401).json({ error: 'Sesión vencida' });

  next();
}
