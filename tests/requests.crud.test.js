/* eslint-disable no-undef */
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../index.js'
import { pool } from '../db.js'   // 👈 usamos el pool real para preparar la DB

// 👇 Antes de las pruebas, deja el dispositivo aprobado y vigente
//    (esto satisface enforceDeviceFreshness en tu middleware)
beforeAll(async () => {
    await pool.query(
      `DELETE FROM devices WHERE device_id=:deviceId AND owner_name=:name AND role=:role`,
      { deviceId: 'test-device-02', name: 'Johan', role: 'assistant' }
    )
    await pool.query(
      `INSERT INTO devices (device_id, owner_name, role, user_agent, approved, last_login)
       VALUES (:deviceId, :name, :role, 'vitest', 1, NOW())`,
      { deviceId: 'test-device-02', name: 'Johan', role: 'assistant' }
    )
  })

describe('Requests API - flujo básico', () => {
  // Generamos un JWT de assistant válido para las pruebas
  const days = Number(process.env.SESSION_DAYS || 30)
  const token = jwt.sign(
    { name: 'Johan', role: 'assistant', deviceId: 'test-device-02' },
    process.env.JWT_SECRET,
    { expiresIn: `${days}d` }
  )
  const cookie = `amade_sess=${token}`

  it('POST /api/requests debe crear una nueva solicitud', async () => {
    const body = {
      requester: 'Test-CLI',
      items: [
        { name: 'Escoba', quantity: 1, unit: 'u' },
        { productId: 13, quantity: 2, unit: 'paquete', notes: 'azul' }
      ]
    }

    const res = await request(app)
      .post('/api/requests')
      .set('Cookie', cookie)
      .send(body)

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
  })

  it('GET /api/requests debe responder 403 al assistant (solo admin puede listar)', async () => {
    const res = await request(app)
      .get('/api/requests')
      .set('Cookie', cookie)

    expect(res.status).toBe(403)
  })
})
