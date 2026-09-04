import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken } from './setup.js';

const admin = () => `access_token=${adminToken()}`;

describe('position stageId round-trip', () => {
  let layoutId = '';
  let productId = '';
  beforeEach(async () => {
    const site = await prisma.site.create({ data: { name: 'S' } });
    const layout = await prisma.layout.create({ data: { siteId: site.id, name: 'L', widthM: 10, heightM: 10 } });
    const project = await prisma.project.create({ data: { name: 'P' } });
    const product = await prisma.product.create({ data: { projectId: project.id, name: 'B', code: 'B1' } });
    layoutId = layout.id; productId = product.id;
  });

  it('lưu và trả lại stageId của position', async () => {
    const saved = await request(app).post('/api/snapshots').set('Cookie', admin()).send({
      layoutId, date: '2026-09-03',
      positions: [{ productId, x: 1, y: 1, stageId: 'stage-abc' }],
    });
    expect(saved.status).toBe(201);
    const got = await request(app).get(`/api/snapshots/${saved.body.id}`).set('Cookie', admin());
    expect(got.body.positions[0].stageId).toBe('stage-abc');
  });
});
