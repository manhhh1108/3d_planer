import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken, viewerToken } from './setup.js';

const admin = () => `access_token=${adminToken()}`;
const viewer = () => `access_token=${viewerToken()}`;

describe('/api/stages', () => {
  it('ADMIN tạo, sửa, list, soft-delete công đoạn', async () => {
    const created = await request(app)
      .post('/api/stages')
      .set('Cookie', admin())
      .send({ name: 'Hàn', color: '#ef4444', order: 2 });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Hàn');
    expect(created.body.active).toBe(true);
    const id = created.body.id as string;

    const patched = await request(app)
      .patch(`/api/stages/${id}`)
      .set('Cookie', admin())
      .send({ name: 'Hàn TIG', color: '#dc2626' });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Hàn TIG');

    const list = await request(app).get('/api/stages').set('Cookie', admin());
    expect(list.status).toBe(200);
    expect(list.body.some((s: any) => s.id === id)).toBe(true);

    const del = await request(app).delete(`/api/stages/${id}`).set('Cookie', admin());
    expect(del.status).toBe(200);
    expect(del.body.active).toBe(false);

    const activeOnly = await request(app).get('/api/stages').set('Cookie', admin());
    expect(activeOnly.body.some((s: any) => s.id === id)).toBe(false);
    const all = await request(app).get('/api/stages?all=1').set('Cookie', admin());
    expect(all.body.some((s: any) => s.id === id)).toBe(true);
  });

  it('VIEWER được list nhưng không được tạo', async () => {
    const list = await request(app).get('/api/stages').set('Cookie', viewer());
    expect(list.status).toBe(200);
    const created = await request(app)
      .post('/api/stages')
      .set('Cookie', viewer())
      .send({ name: 'X', color: '#000000' });
    expect(created.status).toBe(403);
  });
});
