import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken } from './setup.js';
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
    const layout = await makeLayout();
    const res = await request(app)
      .post(`/api/layouts/${layout.id}/background`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', Buffer.from('fake dwg'), 'plan.dwg');
    expect(res.status).toBe(422);
    if (saved !== undefined) process.env.ODA_CONVERTER_PATH = saved;
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
