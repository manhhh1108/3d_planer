import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken, planningToken } from './setup.js';

describe('GET /api/users', () => {
  it('ADMIN sees user list', async () => {
    const r = await request(app).get('/api/users').set('Cookie', `access_token=${adminToken()}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
    expect(r.body[0].passwordHash).toBeUndefined();
  });

  it('PLANNING gets 403', async () => {
    const r = await request(app).get('/api/users').set('Cookie', `access_token=${planningToken()}`);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/users', () => {
  it('ADMIN creates new user', async () => {
    const r = await request(app)
      .post('/api/users')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ email: 'new@test.com', name: 'New User', role: 'PLANNING', password: 'pass123' });
    expect(r.status).toBe(201);
    expect(r.body.email).toBe('new@test.com');
    expect(r.body.role).toBe('PLANNING');
    expect(r.body.passwordHash).toBeUndefined();
  });

  it('duplicate email → 409', async () => {
    const r = await request(app)
      .post('/api/users')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ email: 'admin@test.com', name: 'Dup', role: 'VIEWER', password: 'pass' });
    expect(r.status).toBe(409);
  });

  it('missing fields → 400', async () => {
    const r = await request(app)
      .post('/api/users')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ email: 'x@test.com' });
    expect(r.status).toBe(400);
  });
});

describe('PATCH /api/users/:id', () => {
  it('ADMIN updates name + role + active', async () => {
    const created = (await request(app)
      .post('/api/users')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ email: 'u@test.com', name: 'U', role: 'VIEWER', password: 'pass' })).body;

    const r = await request(app)
      .patch(`/api/users/${created.id}`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'U2', role: 'PLANNING', active: false });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('U2');
    expect(r.body.role).toBe('PLANNING');
    expect(r.body.active).toBe(false);
  });
});

describe('POST /api/users/:id/reset-password', () => {
  it('ADMIN resets password', async () => {
    const created = (await request(app)
      .post('/api/users')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ email: 'reset@test.com', name: 'R', role: 'VIEWER', password: 'oldpass' })).body;

    const r = await request(app)
      .post(`/api/users/${created.id}/reset-password`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ password: 'newpass123' });
    expect(r.status).toBe(200);

    // Verify login with new password works
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset@test.com', password: 'newpass123' });
    expect(login.status).toBe(200);
  });
});
