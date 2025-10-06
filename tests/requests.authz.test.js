/* eslint-disable no-undef */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../index.js'
import jwt from 'jsonwebtoken' 

// Load environment variables from .env file if present
import dotenv from 'dotenv'
dotenv.config()

describe('Requests API - autorización', () => {
  it('GET /api/requests sin cookie debe responder 401 (no autenticado)', async () => {
    const res = await request(app).get('/api/requests')
    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error')
  })
})

it('GET /api/requests con cookie de assistant debe responder 403 (rol insuficiente)', async () => {
  // firmamos un JWT de assistant usando tu JWT_SECRET (mismo mecanismo que usa el backend)
  const days = Number(process.env.SESSION_DAYS || 30)
  const token = jwt.sign(
    { name: 'TestUser', role: 'assistant', deviceId: 'test-device-01' },
    process.env.JWT_SECRET,
    { expiresIn: `${days}d` }
  )

  const res = await request(app)
    .get('/api/requests')
    .set('Cookie', [`amade_sess=${token}`])

  expect(res.status).toBe(403)           // autenticado pero sin rol de admin
  expect(res.body).toHaveProperty('error')
})