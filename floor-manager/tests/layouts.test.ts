import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken, planningToken, viewerToken } from './setup.js';
import fs from 'fs';
import path from 'path';

describe('layouts', () => {
  it('filters layouts by siteId', async () => {
    const site1 = (await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'A' })).body;
    const site2 = (await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'B' })).body;
    await request(app)
      .post('/api/layouts')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ siteId: site1.id, name: 'L1', widthM: 10, heightM: 10 });
    await request(app)
      .post('/api/layouts')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ siteId: site2.id, name: 'L2', widthM: 10, heightM: 10 });

    const res = await request(app)
      .get(`/api/layouts?siteId=${site1.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('L1');

    const all = await request(app)
      .get('/api/layouts')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(all.body).toHaveLength(2);
  });
});

describe('layout dxf block map', () => {
  it('nhớ mapping block -> sản phẩm và bỏ những block chưa chọn', async () => {
    const layout = await makeLayout();

    const saved = await request(app)
      .put(`/api/layouts/${layout.id}/dxf-map`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ dxfBlockMap: { 'A$C0C3937EC': 'prod-1', 'ZW$9178': '' } });
    expect(saved.status).toBe(200);

    const read = await request(app)
      .get(`/api/layouts/${layout.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    // '' = người dùng chọn "bỏ qua" -> không lưu, để lần sau khỏi hiện nhầm
    expect(read.body.dxfBlockMap).toEqual({ 'A$C0C3937EC': 'prod-1' });
  });

  it('từ chối payload không phải object chuỗi -> chuỗi', async () => {
    const layout = await makeLayout();
    const res = await request(app)
      .put(`/api/layouts/${layout.id}/dxf-map`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ dxfBlockMap: { block: 123 } });
    expect(res.status).toBe(400);
  });

  it('404 khi layout không tồn tại', async () => {
    const res = await request(app)
      .put('/api/layouts/khong-co-that/dxf-map')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ dxfBlockMap: {} });
    expect(res.status).toBe(404);
  });
});

async function makeLayout() {
  const site = (await request(app)
    .post('/api/sites')
    .set('Cookie', `access_token=${adminToken()}`)
    .send({ name: 'S' })).body;
  return (await request(app)
    .post('/api/layouts')
    .set('Cookie', `access_token=${adminToken()}`)
    .send({ siteId: site.id, name: 'L', widthM: 10, heightM: 10 })).body;
}

const FIXTURE_DXF = path.join(import.meta.dirname, 'fixtures', 'box.dxf');

describe('layout background', () => {
  it('uploads DXF, returns updated layout with backgroundFile and new dimensions', async () => {
    const layout = await makeLayout();
    const dxf = fs.readFileSync(FIXTURE_DXF);

    const res = await request(app)
      .post(`/api/layouts/${layout.id}/background`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', dxf, 'plan.dxf');

    expect(res.status).toBe(200);
    expect(res.body.backgroundFile).toContain(`/uploads/layouts/${layout.id}/background.svg`);
    expect(res.body.widthM).toBeCloseTo(4, 1);
    expect(res.body.heightM).toBeCloseTo(2, 1);
    const bgFile = path.resolve('./uploads/layouts', layout.id, 'background.svg');
    expect(fs.existsSync(bgFile)).toBe(true);
  });

  it('returns 400 for non-DXF/DWG files', async () => {
    const layout = await makeLayout();
    const res = await request(app)
      .post(`/api/layouts/${layout.id}/background`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', Buffer.from('not a dxf'), 'plan.txt');
    expect(res.status).toBe(400);
  });

  it('returns 422 when uploading DWG without ODA_CONVERTER_PATH', async () => {
    const saved = process.env.ODA_CONVERTER_PATH;
    delete process.env.ODA_CONVERTER_PATH;
    try {
      const layout = await makeLayout();
      const res = await request(app)
        .post(`/api/layouts/${layout.id}/background`)
        .set('Cookie', `access_token=${adminToken()}`)
        .attach('file', Buffer.from('fake dwg'), 'plan.dwg');
      expect(res.status).toBe(422);
    } finally {
      if (saved !== undefined) process.env.ODA_CONVERTER_PATH = saved;
    }
  });

  it('deletes background: clears backgroundFile, preserves widthM/heightM', async () => {
    const layout = await makeLayout();
    const dxf = fs.readFileSync(FIXTURE_DXF);
    await request(app)
      .post(`/api/layouts/${layout.id}/background`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', dxf, 'plan.dxf');

    const res = await request(app)
      .delete(`/api/layouts/${layout.id}/background`)
      .set('Cookie', `access_token=${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.backgroundFile).toBeNull();
    expect(res.body.widthM).toBeCloseTo(4, 1);
    expect(fs.existsSync(path.resolve('./uploads/layouts', layout.id))).toBe(false);
  });

  it('returns 404 when layout does not exist', async () => {
    const res = await request(app)
      .post('/api/layouts/nonexistent-id/background')
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', Buffer.from('x'), 'plan.dxf');
    expect(res.status).toBe(404);
  });
});


// Tường là hình học cố định của mặt bằng (ranh giới xưởng), không đổi theo ngày
// như vị trí block — nên nằm trên layout chứ không nằm trong snapshot.
describe('layout walls', () => {
  const WALL = {
    id: 'w1',
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    thickness: 0.15,
    height: 2.8,
    color: '#444444',
  };

  it('layout mới chưa có tường thì trả về mảng rỗng', async () => {
    const layout = await makeLayout();
    const res = await request(app)
      .get(`/api/layouts/${layout.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.walls).toEqual([]);
  });

  it('PLANNING lưu được tường và GET đọc lại đúng', async () => {
    const layout = await makeLayout();
    const res = await request(app)
      .put(`/api/layouts/${layout.id}/walls`)
      .set('Cookie', `access_token=${planningToken()}`)
      .send({ walls: [WALL] });

    expect(res.status).toBe(200);
    expect(res.body.walls).toEqual([WALL]);

    const got = await request(app)
      .get(`/api/layouts/${layout.id}`)
      .set('Cookie', `access_token=${planningToken()}`);
    expect(got.body.walls).toEqual([WALL]);
  });

  it('giữ nguyên curvePoint của tường cong', async () => {
    const layout = await makeLayout();
    const curved = { ...WALL, id: 'w2', curvePoint: { x: 5, y: 2 } };
    const res = await request(app)
      .put(`/api/layouts/${layout.id}/walls`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ walls: [curved] });
    expect(res.status).toBe(200);
    expect(res.body.walls[0].curvePoint).toEqual({ x: 5, y: 2 });
  });

  it('bỏ qua field lạ, chỉ giữ đúng hình dạng tường', async () => {
    const layout = await makeLayout();
    const res = await request(app)
      .put(`/api/layouts/${layout.id}/walls`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ walls: [{ ...WALL, texture: 'brick', evil: { deep: true } }] });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.walls[0]).sort()).toEqual(
      ['color', 'end', 'height', 'id', 'start', 'thickness'],
    );
  });

  it('gửi mảng rỗng thì xoá hết tường', async () => {
    const layout = await makeLayout();
    await request(app)
      .put(`/api/layouts/${layout.id}/walls`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ walls: [WALL] });

    const res = await request(app)
      .put(`/api/layouts/${layout.id}/walls`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ walls: [] });
    expect(res.status).toBe(200);
    expect(res.body.walls).toEqual([]);
  });

  it('VIEWER không lưu được tường', async () => {
    const layout = await makeLayout();
    const res = await request(app)
      .put(`/api/layouts/${layout.id}/walls`)
      .set('Cookie', `access_token=${viewerToken()}`)
      .send({ walls: [WALL] });
    expect(res.status).toBe(403);
  });

  it('từ chối body không phải mảng', async () => {
    const layout = await makeLayout();
    const res = await request(app)
      .put(`/api/layouts/${layout.id}/walls`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ walls: 'nope' });
    expect(res.status).toBe(400);
  });

  it('từ chối tường thiếu toạ độ', async () => {
    const layout = await makeLayout();
    const res = await request(app)
      .put(`/api/layouts/${layout.id}/walls`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ walls: [{ id: 'w', start: { x: 0 }, end: { x: 1, y: 1 }, thickness: 1, height: 1, color: '#000' }] });
    expect(res.status).toBe(400);
  });

  it('từ chối toạ độ không hữu hạn', async () => {
    const layout = await makeLayout();
    const res = await request(app)
      .put(`/api/layouts/${layout.id}/walls`)
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ walls: [{ ...WALL, end: { x: 'NaN', y: 0 } }] });
    expect(res.status).toBe(400);
  });

  it('404 khi layout không tồn tại', async () => {
    const res = await request(app)
      .put('/api/layouts/nonexistent-id/walls')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ walls: [] });
    expect(res.status).toBe(404);
  });
});
