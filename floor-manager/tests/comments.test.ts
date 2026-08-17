import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken, planningToken, viewerToken } from './setup.js';

async function seedLayout(): Promise<string> {
  const tok = adminToken();
  const site = (
    await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${tok}`)
      .send({ name: 'Test Site' })
  ).body;
  const layout = (
    await request(app)
      .post('/api/layouts')
      .set('Cookie', `access_token=${tok}`)
      .send({ siteId: site.id, name: 'Test Layout', widthM: 100, heightM: 50 })
  ).body;
  return layout.id as string;
}

async function seedSnapshot(layoutId: string): Promise<string> {
  const tok = adminToken();
  const snap = (
    await request(app)
      .post('/api/snapshots')
      .set('Cookie', `access_token=${tok}`)
      .send({ layoutId, date: '2026-08-17', positions: [] })
  ).body;
  return snap.id as string;
}

describe('GET /api/comments', () => {
  it('401 khi không có auth', async () => {
    const res = await request(app).get('/api/comments?layoutId=x');
    expect(res.status).toBe(401);
  });

  it('400 khi thiếu layoutId', async () => {
    const res = await request(app)
      .get('/api/comments')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it('trả về [] khi không có comment', async () => {
    const layoutId = await seedLayout();
    const res = await request(app)
      .get(`/api/comments?layoutId=${layoutId}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/comments', () => {
  it('201 tạo comment trên layout', async () => {
    const layoutId = await seedLayout();
    const res = await request(app)
      .post('/api/comments')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ layoutId, text: 'Cần dịch chuyển block A' });
    expect(res.status).toBe(201);
    expect(res.body.text).toBe('Cần dịch chuyển block A');
    expect(res.body.snapshotId).toBeNull();
    expect(res.body.createdBy).toBe('admin@test.com');
  });

  it('201 tạo comment gắn snapshotId', async () => {
    const layoutId = await seedLayout();
    const snapshotId = await seedSnapshot(layoutId);
    const res = await request(app)
      .post('/api/comments')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ layoutId, snapshotId, text: 'Bố trí ngày hôm nay ổn' });
    expect(res.status).toBe(201);
    expect(res.body.snapshotId).toBe(snapshotId);
  });

  it('201 tạo comment với tọa độ spatial', async () => {
    const layoutId = await seedLayout();
    const res = await request(app)
      .post('/api/comments')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ layoutId, text: 'Khu vực này cần mở rộng', positionX: 25.5, positionY: 30.0 });
    expect(res.status).toBe(201);
    expect(res.body.positionX).toBe(25.5);
    expect(res.body.positionY).toBe(30.0);
  });

  it('400 khi thiếu text', async () => {
    const layoutId = await seedLayout();
    const res = await request(app)
      .post('/api/comments')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ layoutId });
    expect(res.status).toBe(400);
  });

  it('400 khi snapshotId không thuộc layout này', async () => {
    const layoutId = await seedLayout();
    const res = await request(app)
      .post('/api/comments')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ layoutId, snapshotId: 'invalid-id', text: 'test' });
    expect(res.status).toBe(400);
  });

  it('403 khi VIEWER cố tạo comment', async () => {
    const layoutId = await seedLayout();
    const res = await request(app)
      .post('/api/comments')
      .set('Cookie', `access_token=${viewerToken()}`)
      .send({ layoutId, text: 'Unauthorized' });
    expect(res.status).toBe(403);
  });

  it('PLANNING có thể tạo comment', async () => {
    const layoutId = await seedLayout();
    const res = await request(app)
      .post('/api/comments')
      .set('Cookie', `access_token=${planningToken()}`)
      .send({ layoutId, text: 'Kế hoạch tuần tới' });
    expect(res.status).toBe(201);
    expect(res.body.createdBy).toBe('planning@test.com');
  });
});

describe('GET /api/comments (filter)', () => {
  it('lọc theo layoutId, sắp xếp desc', async () => {
    const layoutId = await seedLayout();
    const tok = adminToken();
    await request(app).post('/api/comments').set('Cookie', `access_token=${tok}`)
      .send({ layoutId, text: 'Comment 1' });
    await request(app).post('/api/comments').set('Cookie', `access_token=${tok}`)
      .send({ layoutId, text: 'Comment 2' });
    const res = await request(app)
      .get(`/api/comments?layoutId=${layoutId}`)
      .set('Cookie', `access_token=${tok}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].text).toBe('Comment 2');
  });

  it('lọc theo snapshotId — chỉ trả về comment của snapshot đó', async () => {
    const layoutId = await seedLayout();
    const snapshotId = await seedSnapshot(layoutId);
    const tok = adminToken();
    await request(app).post('/api/comments').set('Cookie', `access_token=${tok}`)
      .send({ layoutId, text: 'Layout comment' });
    await request(app).post('/api/comments').set('Cookie', `access_token=${tok}`)
      .send({ layoutId, snapshotId, text: 'Snapshot comment' });
    const res = await request(app)
      .get(`/api/comments?layoutId=${layoutId}&snapshotId=${snapshotId}`)
      .set('Cookie', `access_token=${tok}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('Snapshot comment');
  });
});

describe('PUT /api/comments/:id', () => {
  it('tác giả sửa được comment của mình', async () => {
    const layoutId = await seedLayout();
    const tok = adminToken();
    const created = (
      await request(app).post('/api/comments').set('Cookie', `access_token=${tok}`)
        .send({ layoutId, text: 'Gốc' })
    ).body;
    const res = await request(app)
      .put(`/api/comments/${created.id}`)
      .set('Cookie', `access_token=${tok}`)
      .send({ text: 'Đã sửa' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Đã sửa');
  });

  it('403 khi PLANNING sửa comment của người khác', async () => {
    const layoutId = await seedLayout();
    const created = (
      await request(app).post('/api/comments').set('Cookie', `access_token=${adminToken()}`)
        .send({ layoutId, text: 'Admin comment' })
    ).body;
    const res = await request(app)
      .put(`/api/comments/${created.id}`)
      .set('Cookie', `access_token=${planningToken()}`)
      .send({ text: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('ADMIN sửa được comment của người khác', async () => {
    const layoutId = await seedLayout();
    const created = (
      await request(app).post('/api/comments').set('Cookie', `access_token=${planningToken()}`)
        .send({ layoutId, text: 'Planning comment' })
    ).body;
    const res = await request(app)
      .put(`/api/comments/${created.id}`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ text: 'ADMIN override' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('ADMIN override');
  });

  it('404 khi comment không tồn tại', async () => {
    const res = await request(app)
      .put('/api/comments/nonexistent-id')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ text: 'test' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/comments/:id', () => {
  it('tác giả xóa được comment của mình', async () => {
    const layoutId = await seedLayout();
    const tok = adminToken();
    const created = (
      await request(app).post('/api/comments').set('Cookie', `access_token=${tok}`)
        .send({ layoutId, text: 'Xóa tôi' })
    ).body;
    await request(app)
      .delete(`/api/comments/${created.id}`)
      .set('Cookie', `access_token=${tok}`)
      .expect(204);
    const check = await request(app)
      .get(`/api/comments?layoutId=${layoutId}`)
      .set('Cookie', `access_token=${tok}`);
    expect(check.body).toHaveLength(0);
  });

  it('403 khi PLANNING xóa comment của người khác', async () => {
    const layoutId = await seedLayout();
    const created = (
      await request(app).post('/api/comments').set('Cookie', `access_token=${adminToken()}`)
        .send({ layoutId, text: 'Admin comment' })
    ).body;
    const res = await request(app)
      .delete(`/api/comments/${created.id}`)
      .set('Cookie', `access_token=${planningToken()}`);
    expect(res.status).toBe(403);
  });

  it('ADMIN xóa được comment của người khác', async () => {
    const layoutId = await seedLayout();
    const created = (
      await request(app).post('/api/comments').set('Cookie', `access_token=${planningToken()}`)
        .send({ layoutId, text: 'Planning comment' })
    ).body;
    await request(app)
      .delete(`/api/comments/${created.id}`)
      .set('Cookie', `access_token=${adminToken()}`)
      .expect(204);
  });
});
