import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken, planningToken } from './setup.js';
import fs from 'fs';
import { siteLogoPaths } from '../server/cad/paths.js';

describe('sites', () => {
  it('creates a site and lists it with layout count', async () => {
    const created = await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'Xưởng 1', address: 'KCN A' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Xưởng 1');
    expect(created.body.active).toBe(true);

    const res = await request(app)
      .get('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]._count.layouts).toBe(0);
  });

  it('rejects create without name', async () => {
    const res = await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ address: 'x' });
    expect(res.status).toBe(400);
  });

  it('gets a site with its layouts', async () => {
    const site = (await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'S' })).body;
    await request(app)
      .post('/api/layouts')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ siteId: site.id, name: 'Bãi A', widthM: 100, heightM: 50 });

    const res = await request(app)
      .get(`/api/sites/${site.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.layouts).toHaveLength(1);
    expect(res.body.layouts[0].name).toBe('Bãi A');
  });

  it('updates a site', async () => {
    const site = (await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'S' })).body;
    const res = await request(app)
      .put(`/api/sites/${site.id}`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'S2', active: false });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('S2');
    expect(res.body.active).toBe(false);
  });

  it('deletes an empty site', async () => {
    const site = (await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'S' })).body;
    const res = await request(app)
      .delete(`/api/sites/${site.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(204);
  });

  it('refuses to delete a site that has layouts', async () => {
    const site = (await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'S' })).body;
    await request(app)
      .post('/api/layouts')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ siteId: site.id, name: 'L', widthM: 10, heightM: 10 });
    const res = await request(app)
      .delete(`/api/sites/${site.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(409);
  });
});

// JPEG 1x1 hợp lệ nhỏ nhất — đủ để multer nhận đúng mimetype
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

describe('site company branding', () => {
  async function makeSite() {
    return (await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'S' })).body;
  }

  it('lưu tên công ty cho khung tên bản vẽ', async () => {
    const site = await makeSite();
    const res = await request(app)
      .put(`/api/sites/${site.id}`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ companyName: '  Công ty CP VHE  ' });
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe('Công ty CP VHE');

    // '' = xoá, khác với không gửi gì
    const cleared = await request(app)
      .put(`/api/sites/${site.id}`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ companyName: '' });
    expect(cleared.body.companyName).toBeNull();
  });

  it('tải logo lên, phục vụ được và gỡ được', async () => {
    const site = await makeSite();
    const up = await request(app)
      .put(`/api/sites/${site.id}/logo`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', JPEG_1PX, { filename: 'logo.jpg', contentType: 'image/jpeg' });
    expect(up.status).toBe(200);
    expect(up.body.companyLogo).toBe(`/uploads/sites/${site.id}/logo.jpg`);
    expect(fs.existsSync(siteLogoPaths(site.id, 'jpg').file)).toBe(true);

    const del = await request(app)
      .delete(`/api/sites/${site.id}/logo`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(del.status).toBe(200);
    expect(del.body.companyLogo).toBeNull();
    expect(fs.existsSync(siteLogoPaths(site.id, 'jpg').file)).toBe(false);
  });

  it('từ chối file không phải ảnh', async () => {
    const site = await makeSite();
    const res = await request(app)
      .put(`/api/sites/${site.id}/logo`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', Buffer.from('không phải ảnh'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('chỉ ADMIN được đổi logo', async () => {
    const site = await makeSite();
    const res = await request(app)
      .put(`/api/sites/${site.id}/logo`)
      .set('Cookie', `access_token=${planningToken()}`)
      .attach('file', JPEG_1PX, { filename: 'logo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(403);
  });
});
