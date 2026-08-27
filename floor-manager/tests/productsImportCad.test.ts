import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken } from './setup.js';

async function makeProject() {
  return (
    await request(app)
      .post('/api/projects')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'P' })
  ).body;
}

describe('mã sản phẩm là duy nhất trong một dự án', () => {
  it('tạo trùng mã trong cùng dự án bị từ chối bằng 409', async () => {
    const proj = await makeProject();
    const first = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ projectId: proj.id, name: 'Dầm A', code: '662-01' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ projectId: proj.id, name: 'Dầm A lần hai', code: '662-01' });
    expect(second.status).toBe(409);

    const all = await prisma.product.findMany({ where: { projectId: proj.id } });
    expect(all).toHaveLength(1);
  });

  it('cùng mã ở hai dự án khác nhau thì vẫn được', async () => {
    const a = await makeProject();
    const b = await makeProject();
    const token = adminToken();
    const r1 = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${token}`)
      .send({ projectId: a.id, name: 'X', code: '662-01' });
    const r2 = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${token}`)
      .send({ projectId: b.id, name: 'X', code: '662-01' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });

  it('đổi mã sang mã đã có của dự án cũng bị 409', async () => {
    const proj = await makeProject();
    const token = adminToken();
    await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${token}`)
      .send({ projectId: proj.id, name: 'A', code: 'AAA' });
    const second = (
      await request(app)
        .post('/api/products')
        .set('Cookie', `access_token=${token}`)
        .send({ projectId: proj.id, name: 'B', code: 'BBB' })
    ).body;

    const res = await request(app)
      .put(`/api/products/${second.id}`)
      .set('Cookie', `access_token=${token}`)
      .send({ code: 'AAA' });
    expect(res.status).toBe(409);
  });
});
