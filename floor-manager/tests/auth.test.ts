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

import prisma from '../server/db.js';
import app from '../server/app.js';

describe('POST /api/auth/login', () => {
  it('success — returns user + sets cookies', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'pass' });
    expect(r.status).toBe(200);
    expect(r.body.email).toBe('admin@test.com');
    expect(r.body.role).toBe('ADMIN');
    expect(r.body.passwordHash).toBeUndefined();
    const cookies = r.headers['set-cookie'] as string[];
    expect(cookies.some((c: string) => c.startsWith('access_token='))).toBe(true);
    expect(cookies.some((c: string) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('wrong password → 401', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'wrong' });
    expect(r.status).toBe(401);
  });

  it('nonexistent user → 401', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'pass' });
    expect(r.status).toBe(401);
  });

  it('inactive user → 403', async () => {
    await prisma.user.update({
      where: { email: 'admin@test.com' },
      data: { active: false },
    });
    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'pass' });
    expect(r.status).toBe(403);
  });

  it('missing fields → 400', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'admin@test.com' });
    expect(r.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns new access token when refresh token is valid', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'pass' });
    const cookies = login.headers['set-cookie'] as string[];
    const refreshCookie = cookies.find((c: string) => c.startsWith('refresh_token='))!;

    const r = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.accessToken).toBeTruthy();
    expect(r.body.user.email).toBe('admin@test.com');
  });

  it('no refresh token → 401', async () => {
    const r = await request(app).post('/api/auth/refresh');
    expect(r.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears cookies', async () => {
    const r = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(r.status).toBe(200);
    const cookies = r.headers['set-cookie'] as string[];
    expect(cookies.some((c: string) => c.includes('access_token=;'))).toBe(true);
  });
});

describe('GET /api/auth/me', () => {
  it('returns current user info', async () => {
    const r = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(r.status).toBe(200);
    expect(r.body.email).toBe('admin@test.com');
    expect(r.body.name).toBe('Admin');
    expect(r.body.passwordHash).toBeUndefined();
  });

  it('401 without token', async () => {
    const r = await request(app).get('/api/auth/me');
    expect(r.status).toBe(401);
  });
});
