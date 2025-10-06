import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../index.js'

describe('Auth API', () => {
  it('GET /api/auth/status sin parámetros debe devolver 400', async () => {
    const res = await request(app).get('/api/auth/status')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })
})
