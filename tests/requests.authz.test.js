import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../index.js'

describe('Requests API - autorización', () => {
  it('GET /api/requests sin cookie admin debe responder 403', async () => {
    const res = await request(app).get('/api/requests')
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })
})
