import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken } from './setup.js';

describe('app', () => {
  it('GET /api/projects returns empty list on clean DB', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
