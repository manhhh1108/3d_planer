import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken } from './setup.js';

const admin = () => `access_token=${adminToken()}`;

describe('snapshot zones round-trip', () => {
  let layoutId = '';
  // beforeEach (không phải beforeAll): setup.ts truncate mọi bảng ở beforeEach gốc
  // chạy TRƯỚC beforeEach của describe, nên layout phải tạo lại sau khi truncate.
  beforeEach(async () => {
    const site = await prisma.site.create({ data: { name: 'S1' } });
    const layout = await prisma.layout.create({
      data: { siteId: site.id, name: 'L1', widthM: 10, heightM: 10 },
    });
    layoutId = layout.id;
  });

  it('POST lưu zones và GET trả lại nguyên vẹn', async () => {
    const zones = [
      { id: 'z1', name: 'Khu hàn', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], allowedStageIds: ['s1'] },
    ];
    const saved = await request(app)
      .post('/api/snapshots')
      .set('Cookie', admin())
      .send({ layoutId, date: '2026-09-03', positions: [], zones });
    expect(saved.status).toBe(201);

    const got = await request(app)
      .get(`/api/snapshots/${saved.body.id}`)
      .set('Cookie', admin());
    expect(got.status).toBe(200);
    expect(got.body.zones).toEqual(zones);
  });
});
