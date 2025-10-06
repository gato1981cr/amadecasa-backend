import { describe, it, expect } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../index.js'

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
