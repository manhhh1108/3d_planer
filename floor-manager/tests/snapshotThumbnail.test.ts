import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import app from '../server/app.js';
import { snapshotThumbPaths } from '../server/cad/paths.js';
import { layoutBgPaths } from '../server/cad/paths.js';
import { adminToken, planningToken, viewerToken } from './setup.js';

// JPEG 1x1 hợp lệ nhỏ nhất — đủ để multer nhận đúng mimetype
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

async function seedSnapshot() {
  const token = adminToken();
  const site = (await request(app).post('/api/sites')
    .set('Cookie', `access_token=${token}`).send({ name: 'S' })).body;
  const layout = (await request(app).post('/api/layouts')
    .set('Cookie', `access_token=${token}`)
    .send({ siteId: site.id, name: 'L', widthM: 100, heightM: 60 })).body;
  const snapshot = (await request(app).post('/api/snapshots')
    .set('Cookie', `access_token=${token}`)
    .send({ layoutId: layout.id, date: '2026-08-24', positions: [] })).body;
  return { site, layout, snapshot };
}

describe('snapshot thumbnail', () => {
  it('lưu ảnh, ghi file và trả về url', async () => {
    const { layout, snapshot } = await seedSnapshot();

    const res = await request(app)
      .put(`/api/snapshots/${snapshot.id}/thumbnail`)
      .set('Cookie', `access_token=${planningToken()}`)
      .attach('file', JPEG_1PX, { filename: 'thumb.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    const p = snapshotThumbPaths(layout.id, snapshot.id);
    expect(res.body.thumbnail).toBe(p.url);
    expect(fs.existsSync(p.file)).toBe(true);
  });

  it('lưu lần hai ghi đè tại chỗ, không sinh file mới', async () => {
    const { layout, snapshot } = await seedSnapshot();
    const put = () => request(app)
      .put(`/api/snapshots/${snapshot.id}/thumbnail`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', JPEG_1PX, { filename: 'thumb.jpg', contentType: 'image/jpeg' });

    await put();
    await put();

    const p = snapshotThumbPaths(layout.id, snapshot.id);
    // Autosave chạy liên tục — mỗi lần một file mới thì uploads phình vô hạn
    expect(fs.readdirSync(p.dir)).toEqual([`${snapshot.id}.jpg`]);
  });

  it('thẻ layout trên trang mặt bằng đọc được ảnh mới nhất', async () => {
    const { site, layout, snapshot } = await seedSnapshot();
    await request(app)
      .put(`/api/snapshots/${snapshot.id}/thumbnail`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', JPEG_1PX, { filename: 'thumb.jpg', contentType: 'image/jpeg' });

    const res = await request(app)
      .get(`/api/sites/${site.id}`)
      .set('Cookie', `access_token=${viewerToken()}`);

    expect(res.status).toBe(200);
    const got = res.body.layouts.find((l: { id: string }) => l.id === layout.id);
    expect(got.snapshots).toHaveLength(1);
    expect(got.snapshots[0].thumbnail).toBe(snapshotThumbPaths(layout.id, snapshot.id).url);
  });

  it('layout chưa có ảnh thì trả về null, không nổ', async () => {
    const { site, layout } = await seedSnapshot();
    const res = await request(app)
      .get(`/api/sites/${site.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    const got = res.body.layouts.find((l: { id: string }) => l.id === layout.id);
    expect(got.snapshots[0].thumbnail).toBeNull();
  });

  it('VIEWER không lưu được ảnh', async () => {
    const { snapshot } = await seedSnapshot();
    const res = await request(app)
      .put(`/api/snapshots/${snapshot.id}/thumbnail`)
      .set('Cookie', `access_token=${viewerToken()}`)
      .attach('file', JPEG_1PX, { filename: 'thumb.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(403);
  });

  it('từ chối file không phải ảnh', async () => {
    const { snapshot } = await seedSnapshot();
    const res = await request(app)
      .put(`/api/snapshots/${snapshot.id}/thumbnail`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', Buffer.from('không phải ảnh'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('404 khi snapshot không tồn tại', async () => {
    const res = await request(app)
      .put('/api/snapshots/khong-co/thumbnail')
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', JPEG_1PX, { filename: 'thumb.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
  });

  it('xoá layout dọn luôn ảnh snapshot, không để file mồ côi', async () => {
    const { layout, snapshot } = await seedSnapshot();
    await request(app)
      .put(`/api/snapshots/${snapshot.id}/thumbnail`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', JPEG_1PX, { filename: 'thumb.jpg', contentType: 'image/jpeg' });
    expect(fs.existsSync(snapshotThumbPaths(layout.id, snapshot.id).file)).toBe(true);

    const del = await request(app)
      .delete(`/api/layouts/${layout.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(del.status).toBe(204);
    expect(fs.existsSync(layoutBgPaths(layout.id).artifactDir)).toBe(false);
  });
});
