import { describe, it, expect } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { adminToken, planningToken, viewerToken } from './setup.js';
import { requireAuth, requireRole } from '../server/middleware/auth.js';

// Minimal test app for middleware testing — NOT the production app
const mw = express();
mw.use(cookieParser());
mw.get('/p', requireAuth, (req, res) => res.json({ email: (req as any).user?.email }));
mw.get('/admin', requireAuth, requireRole('ADMIN'), (_req, res) => res.json({ ok: true }));
mw.get('/planning', requireAuth, requireRole('ADMIN', 'PLANNING'), (_req, res) => res.json({ ok: true }));

describe('requireAuth middleware', () => {
  it('401 without token', async () => {
    const r = await request(mw).get('/p');
    expect(r.status).toBe(401);
  });

  it('401 with invalid token', async () => {
    const r = await request(mw).get('/p').set('Cookie', 'access_token=bad.token');
    expect(r.status).toBe(401);
  });

  it('200 with valid admin token', async () => {
    const r = await request(mw).get('/p').set('Cookie', `access_token=${adminToken()}`);
    expect(r.status).toBe(200);
    expect(r.body.email).toBe('admin@test.com');
  });

  it('403 when VIEWER accesses admin-only route', async () => {
    const r = await request(mw).get('/admin').set('Cookie', `access_token=${viewerToken()}`);
    expect(r.status).toBe(403);
  });

  it('200 when ADMIN accesses admin route', async () => {
    const r = await request(mw).get('/admin').set('Cookie', `access_token=${adminToken()}`);
    expect(r.status).toBe(200);
  });

  it('403 when VIEWER accesses planning+ route', async () => {
    const r = await request(mw).get('/planning').set('Cookie', `access_token=${viewerToken()}`);
    expect(r.status).toBe(403);
  });

  it('200 when PLANNING accesses planning+ route', async () => {
    const r = await request(mw).get('/planning').set('Cookie', `access_token=${planningToken()}`);
    expect(r.status).toBe(200);
  });
});
