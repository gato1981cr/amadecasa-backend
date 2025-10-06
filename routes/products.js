// ~/amade/api/routes/products.js
import { Router } from 'express';
import { pool } from '../db.js';
//import { requireAssist } from '../auth.js';

export const productsRouter = Router();

/**
 * POST /api/products
 * Crea un producto de catálogo.
 * Body esperado:
 * { "name": "...", "brand": "...", "presentation": "...", "unit": "botella", "category": "Cocina" }
 */
productsRouter.post('/products', async (req, res) => {
  const { name, brand, presentation, unit, category } = req.body || {};

  // Validación mínima
  if (!name || !unit) {
    return res.status(400).json({ error: 'Campos requeridos: name, unit' });
  }

  try {
    const sql = `
      INSERT INTO products (name, brand, presentation, unit, category)
      VALUES (:name, :brand, :presentation, :unit, :category)
    `;
    const params = { name, brand: brand || null, presentation: presentation || null, unit, category: category || null };

    const [result] = await pool.query(sql, params);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = :id', { id: result.insertId });

    return res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'DB error' });
  }
});
