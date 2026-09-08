import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken, viewerToken } from './setup.js';

const admin = () => `access_token=${adminToken()}`;
const viewer = () => `access_token=${viewerToken()}`;

describe('assets reconvert + normalizeUpright', () => {
  let assetId = '';
  beforeEach(async () => {
    const a = await prisma.asset.create({
      data: { fileName: 'x.step', fileType: 'step', status: 'ready' },
    });
    assetId = a.id;
  });

  it('PATCH doi duoc co normalizeUpright (ADMIN)', async () => {
    const res = await request(app).patch(`/api/assets/${assetId}`)
      .set('Cookie', admin()).send({ normalizeUpright: false });
    expect(res.status).toBe(200);
    expect(res.body.normalizeUpright).toBe(false);
  });

  it('PATCH tu choi gia tri khong phai boolean', async () => {
    const res = await request(app).patch(`/api/assets/${assetId}`)
      .set('Cookie', admin()).send({ normalizeUpright: 'nope' });
    expect(res.status).toBe(400);
  });

  it('POST /:id/reconvert duoc chap nhan (ADMIN)', async () => {
    const res = await request(app).post(`/api/assets/${assetId}/reconvert`).set('Cookie', admin());
    expect(res.status).toBe(202);
    const a = await prisma.asset.findUnique({ where: { id: assetId } });
    expect(['pending', 'processing', 'ready', 'failed']).toContain(a!.status);
  });

  it('VIEWER khong duoc PATCH / reconvert', async () => {
    const p = await request(app).patch(`/api/assets/${assetId}`)
      .set('Cookie', viewer()).send({ normalizeUpright: false });
    expect(p.status).toBe(403);
    const r = await request(app).post(`/api/assets/${assetId}/reconvert`).set('Cookie', viewer());
    expect(r.status).toBe(403);
  });

  it('404 khi asset khong ton tai', async () => {
    const res = await request(app).post('/api/assets/nope/reconvert').set('Cookie', admin());
    expect(res.status).toBe(404);
  });
});
