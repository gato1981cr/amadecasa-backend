// ~/amade/api/utils/approvals.js
import crypto from 'crypto';
import { pool } from '../db.js';

/**
 * Crea un token de aprobación Telegram y lo guarda en la tabla `approvals`.
 * @param {Object} params
 * @param {string} params.deviceId
 * @param {string} params.ownerName
 * @param {string} params.role
 * @param {number} [params.ttlMinutes=10]
 */
export async function createApproval({ deviceId, ownerName, role, ttlMinutes = 10 }) {
  const token = crypto.randomBytes(24).toString('hex'); // 48 caracteres
  const expires = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await pool.query(
    `INSERT INTO approvals (device_id, owner_name, role, token, expires_at, used)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [deviceId, ownerName, role, token, expires]
  );

  return { token, expiresAt: expires };
}
