import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken, planningToken, viewerToken } from './setup.js';

const as = (t: string) => `access_token=${t}`;

/**
 * Layout là mặt bằng thi công nên PLANNING làm chủ hoàn toàn; Site là cấu hình
 * cơ sở vật chất nên vẫn chỉ ADMIN. Ranh giới đó dễ bị xê dịch lúc thêm endpoint
 * mới, nên khoá lại bằng test.
 */
describe('quyền trên layout và site', () => {
  let siteId = '';
  beforeEach(async () => {
    const site = await prisma.site.create({ data: { name: 'S' } });
    siteId = site.id;
  });

  describe('PLANNING làm chủ layout', () => {
    it('tạo được layout', async () => {
      const r = await request(app).post('/api/layouts').set('Cookie', as(planningToken()))
        .send({ siteId, name: 'L', widthM: 10, heightM: 5 });
      expect(r.status).toBe(201);
      expect(r.body.name).toBe('L');
    });

    it('sửa được tên và kích thước', async () => {
      const created = await request(app).post('/api/layouts').set('Cookie', as(planningToken()))
        .send({ siteId, name: 'L', widthM: 10, heightM: 5 });
      const r = await request(app).put(`/api/layouts/${created.body.id}`).set('Cookie', as(planningToken()))
        .send({ name: 'L sửa', widthM: 20, heightM: 8 });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ name: 'L sửa', widthM: 20, heightM: 8 });
    });

    it('xoá được layout', async () => {
      const created = await request(app).post('/api/layouts').set('Cookie', as(planningToken()))
        .send({ siteId, name: 'L', widthM: 10, heightM: 5 });
      const r = await request(app).delete(`/api/layouts/${created.body.id}`)
        .set('Cookie', as(planningToken()));
      expect(r.status).toBeLessThan(300);
      expect(await prisma.layout.count({ where: { id: created.body.id } })).toBe(0);
    });

    it('xoá được nền bản vẽ', async () => {
      const created = await request(app).post('/api/layouts').set('Cookie', as(adminToken()))
        .send({ siteId, name: 'L', widthM: 10, heightM: 5 });
      const r = await request(app).delete(`/api/layouts/${created.body.id}/background`)
        .set('Cookie', as(planningToken()));
      // Không có nền để xoá thì vẫn phải qua được cửa phân quyền
      expect(r.status).not.toBe(403);
    });

    it('vẫn lưu được tường (không mất quyền cũ)', async () => {
      const created = await request(app).post('/api/layouts').set('Cookie', as(planningToken()))
        .send({ siteId, name: 'L', widthM: 10, heightM: 5 });
      const r = await request(app).put(`/api/layouts/${created.body.id}/walls`)
        .set('Cookie', as(planningToken()))
        .send({
          walls: [{
            id: 'w1', start: { x: 0, y: 0 }, end: { x: 10, y: 0 },
            thickness: 0.15, height: 2.8, color: '#444444',
          }],
        });
      expect(r.status).toBe(200);
    });
  });

  describe('VIEWER vẫn chỉ đọc', () => {
    it('không tạo được layout', async () => {
      const r = await request(app).post('/api/layouts').set('Cookie', as(viewerToken()))
        .send({ siteId, name: 'L', widthM: 10, heightM: 5 });
      expect(r.status).toBe(403);
    });

    it('không xoá được layout', async () => {
      const created = await request(app).post('/api/layouts').set('Cookie', as(adminToken()))
        .send({ siteId, name: 'L', widthM: 10, heightM: 5 });
      const r = await request(app).delete(`/api/layouts/${created.body.id}`)
        .set('Cookie', as(viewerToken()));
      expect(r.status).toBe(403);
    });

    it('vẫn đọc được danh sách layout', async () => {
      const r = await request(app).get('/api/layouts').set('Cookie', as(viewerToken()));
      expect(r.status).toBe(200);
    });
  });

  describe('Site vẫn là việc của ADMIN', () => {
    it('PLANNING không tạo được site', async () => {
      const r = await request(app).post('/api/sites').set('Cookie', as(planningToken()))
        .send({ name: 'Xưởng mới' });
      expect(r.status).toBe(403);
    });

    it('PLANNING không sửa được site', async () => {
      const r = await request(app).put(`/api/sites/${siteId}`).set('Cookie', as(planningToken()))
        .send({ name: 'Đổi tên' });
      expect(r.status).toBe(403);
    });

    it('PLANNING không xoá được site', async () => {
      const r = await request(app).delete(`/api/sites/${siteId}`).set('Cookie', as(planningToken()));
      expect(r.status).toBe(403);
    });
  });
});
