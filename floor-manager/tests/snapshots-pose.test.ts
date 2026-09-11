import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken } from './setup.js';

const admin = () => `access_token=${adminToken()}`;

/**
 * Tư thế nằm Úp/Ngửa của block lật nghiêng/dựng. Cột `pose` nullable: mọi
 * snapshot lưu trước khi có tính năng này đọc ra null = chỉ lật 90° như cũ.
 */
describe('snapshot lưu tư thế nằm (pose)', () => {
  let layoutId = '';
  let productId = '';
  beforeEach(async () => {
    const site = await prisma.site.create({ data: { name: 'S1' } });
    layoutId = (await prisma.layout.create({
      data: { siteId: site.id, name: 'L1', widthM: 50, heightM: 50 },
    })).id;
    const project = await prisma.project.create({ data: { name: 'P1' } });
    productId = (await prisma.product.create({
      data: { projectId: project.id, name: 'ST4-5', code: 'ST4-5' },
    })).id;
  });

  async function saveAndRead(positions: object[]) {
    const saved = await request(app)
      .post('/api/snapshots').set('Cookie', admin())
      .send({ layoutId, date: '2026-09-11', positions });
    expect(saved.status).toBe(201);
    const got = await request(app).get(`/api/snapshots/${saved.body.id}`).set('Cookie', admin());
    expect(got.status).toBe(200);
    return got.body.positions as { pose: string | null; orientation: string; x: number }[];
  }

  it('lưu và đọc lại đúng úp / ngửa', async () => {
    const got = await saveAndRead([
      { productId, x: 1, y: 1, orientation: 'side', pose: 'prone' },
      { productId, x: 9, y: 9, orientation: 'end2', pose: 'supine' },
    ]);
    const byX = Object.fromEntries(got.map((p) => [p.x, p.pose]));
    expect(byX[1]).toBe('prone');
    expect(byX[9]).toBe('supine');
  });

  it('không gửi pose (client cũ) → null', async () => {
    const got = await saveAndRead([{ productId, x: 1, y: 1, orientation: 'side' }]);
    expect(got[0].pose).toBeNull();
  });

  it('chuỗi lạ, hoặc pose trên block nằm đáy → ghi null, không lưu rác', async () => {
    const got = await saveAndRead([
      { productId, x: 1, y: 1, orientation: 'side', pose: 'lung-tung' },
      { productId, x: 9, y: 9, orientation: 'bottom', pose: 'prone' },
    ]);
    expect(got.every((p) => p.pose === null)).toBe(true);
  });
});
