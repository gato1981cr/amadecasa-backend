// ~/amade/api/routes/requests.js
import { Router } from 'express';
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { requireAssistOrGuest, enforceDeviceFreshness } from '../auth-mw.js';



export const requestsRouter = Router();

/** Middleware local: requiere sesión con rol ADMIN */
function requireAdminLocal(req, res, next) {
  try {
    const token = req.cookies?.amade_sess;
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    const session = jwt.verify(token, process.env.JWT_SECRET);
    if (session?.role !== 'admin') {
      return res.status(403).json({ error: 'Solo admin' });
    }
    req.session = session;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
}

/**
 * POST /api/requests
 * Crea una solicitud con sus ítems (asistente/invitado).
 * Body:
 * {
 *   "requester": "María",
 *   "items": [
 *     { "productId": 12, "quantity": 2, "unit": "botella", "notes": "Marca lavanda" },
 *     { "name": "Jabón para manos", "quantity": 3, "unit": "botella" }
 *   ]
 * }
 */
requestsRouter.post(
  '/requests',
  requireAssistOrGuest,
  enforceDeviceFreshness,
  async (req, res) => {
    const { requester, items } = req.body || {};
    if (!requester || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'requester e items son requeridos' });
    }

    // Validación de items
    for (const it of items) {
      const qty = Number(it.quantity);
      if (!(qty > 0)) return res.status(400).json({ error: 'quantity debe ser > 0' });
      if (!it.productId && !it.name) {
        return res.status(400).json({ error: 'Cada item requiere productId o name' });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Insert solicitud
      const [r] = await conn.query(
        'INSERT INTO requests (requester) VALUES (:requester)',
        { requester }
      );
      const requestId = r.insertId;

      // Insert ítems
      const insertSql = `
        INSERT INTO request_items
        (request_id, product_id, name, quantity, unit, notes)
        VALUES (:request_id, :product_id, :name, :quantity, :unit, :notes)
      `;

      for (const it of items) {
        const params = {
          request_id: requestId,
          product_id: it.productId ?? null,
          name: it.name ?? null,
          quantity: Number(it.quantity),
          unit: it.unit ?? null,
          notes: it.notes ?? null
        };
        await conn.query(insertSql, params);
      }

      await conn.commit();
      return res.status(201).json({ id: requestId });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      return res.status(500).json({ error: 'DB error' });
    } finally {
      conn.release();
    }
  }
);

/**
 * GET /api/requests
 * Lista solicitudes con sus ítems (solo admin).
 */
requestsRouter.get('/requests', requireAdminLocal, async (req, res) => {
  try {
    const [requests] = await pool.query(
      'SELECT id, requester, created_at FROM requests ORDER BY created_at DESC'
    );
    if (requests.length === 0) return res.json([]);

    // Traer todos los ítems de un solo tiro
    const ids = requests.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const [items] = await pool.query(
      `SELECT id, request_id, product_id, name, quantity, unit, notes
       FROM request_items
       WHERE request_id IN (${placeholders})`,
      ids
    );

    // Agrupar por request_id
    const byReq = {};
    for (const it of items) {
      if (!byReq[it.request_id]) byReq[it.request_id] = [];
      byReq[it.request_id].push(it);
    }

    const out = requests.map(r => ({ ...r, items: byReq[r.id] || [] }));
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/requests/:id  (solo admin)
requestsRouter.get('/requests/:id', requireAdminLocal, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const [[reqRow]] = await pool.query(
    `SELECT id, requester, created_at
       FROM requests
      WHERE id = :id`,
    { id }
  );
  if (!reqRow) return res.status(404).json({ error: 'No existe' });

  const [items] = await pool.query(
    `SELECT id, request_id, product_id, name, quantity, unit, notes
       FROM request_items
      WHERE request_id = :id
      ORDER BY id ASC`,
    { id }
  );

  res.json({ ...reqRow, items });
});


/**
 * GET /api/requests/export
 * Descarga JSON con todas las solicitudes + ítems (solo admin).
 */
requestsRouter.get('/requests/export', requireAdminLocal, async (req, res) => {
  try {
    const [requests] = await pool.query(
      'SELECT id, requester, created_at FROM requests ORDER BY created_at DESC'
    );

    let items = [];
    if (requests.length) {
      const ids = requests.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT id, request_id, product_id, name, quantity, unit, notes
         FROM request_items
         WHERE request_id IN (${placeholders})`,
        ids
      );
      items = rows;
    }

    const byReq = {};
    for (const it of items) {
      if (!byReq[it.request_id]) byReq[it.request_id] = [];
      byReq[it.request_id].push(it);
    }

    const out = requests.map(r => ({ ...r, items: byReq[r.id] || [] }));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="solicitudes.json"');
    res.send(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});
