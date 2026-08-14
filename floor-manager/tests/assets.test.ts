import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { convertQueue } from '../server/routes/assets.js';
import { assetPaths as assetPathsForTest } from '../server/cad/paths.js';
import { adminToken } from './setup.js';

const FIXTURE_DXF = path.join(import.meta.dirname, 'fixtures', 'box.dxf');

async function makeProduct() {
  const proj = (await request(app)
    .post('/api/projects')
    .set('Cookie', `access_token=${adminToken()}`)
    .send({ name: 'P' })).body;
  return (
    await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ projectId: proj.id, name: 'B', code: 'B1' })
  ).body;
}

describe('assets routes', () => {
  it('uploads a file, creates pending asset, links product', async () => {
    const prod = await makeProduct();
    const res = await request(app)
      .post('/api/assets')
      .set('Cookie', `access_token=${adminToken()}`)
      .field('productId', prod.id)
      .attach('file', Buffer.from('0\nEOF\n'), 'block.dxf');
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.fileType).toBe('dxf');
    expect(res.body.fileName).toBe('block.dxf');

    const linked = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(linked!.assetId).toBe(res.body.id);
    // file gốc nằm trong storage/sources, không nằm trong uploads
    const src = path.resolve('./storage/sources', res.body.id, 'source.dxf');
    expect(fs.existsSync(src)).toBe(true);
  });

  it('rejects unsupported extensions', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', Buffer.from('x'), 'note.txt');
    expect(res.status).toBe(400);
  });

  it('gets asset status with urls when ready', async () => {
    const created = (
      await request(app)
        .post('/api/assets')
        .set('Cookie', `access_token=${adminToken()}`)
        .attach('file', Buffer.from('0\nEOF\n'), 'a.dxf')
    ).body;
    // Wait for async converter to finish (will fail since 0\nEOF is empty)
    await convertQueue.idle();
    // Manually set to ready to test serialize
    await prisma.asset.update({ where: { id: created.id }, data: { status: 'ready' } });
    const res = await request(app)
      .get(`/api/assets/${created.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.footprintUrl).toBe(`/uploads/assets/${created.id}/footprint.json`);
    expect(res.body.thumbUrl).toBe(`/uploads/assets/${created.id}/thumb.svg`);
  });

  it('404 on unknown asset', async () => {
    const res = await request(app)
      .get('/api/assets/nope')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it('deletes asset: unlinks product, removes rows and files', async () => {
    const prod = await makeProduct();
    const created = (
      await request(app)
        .post('/api/assets')
        .set('Cookie', `access_token=${adminToken()}`)
        .field('productId', prod.id)
        .attach('file', Buffer.from('0\nEOF\n'), 'a.dxf')
    ).body;
    const res = await request(app)
      .delete(`/api/assets/${created.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(204);
    expect(await prisma.asset.findUnique({ where: { id: created.id } })).toBeNull();
    const p = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(p!.assetId).toBeNull();
    expect(fs.existsSync(path.resolve('./storage/sources', created.id))).toBe(false);
  });
});

describe('end-to-end conversion (dxf)', () => {
  it('converts uploaded DXF to ready asset with artifacts and updates product', async () => {
    const prod = await makeProduct();
    const dxf = fs.readFileSync(FIXTURE_DXF);
    const created = (
      await request(app)
        .post('/api/assets')
        .set('Cookie', `access_token=${adminToken()}`)
        .field('productId', prod.id)
        .attach('file', dxf, 'block.dxf')
    ).body;

    await convertQueue.idle();

    const res = await request(app)
      .get(`/api/assets/${created.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.body.status).toBe('ready');
    expect(res.body.bboxLengthM).toBeCloseTo(4, 2);
    expect(res.body.areaM2).toBeCloseTo(8, 1);
    expect(res.body.meshUrl).toBeNull(); // DXF không có mesh

    const p = assetPathsForTest(created.id);
    expect(fs.existsSync(p.footprintFile)).toBe(true);
    expect(fs.existsSync(p.thumbFile)).toBe(true);
    const fp = JSON.parse(fs.readFileSync(p.footprintFile, 'utf8'));
    expect(fp.polygons.length).toBe(1);

    const updated = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(updated!.areaM2).toBeCloseTo(8, 1);
    expect(updated!.thumbnail).toBe(`/uploads/assets/${created.id}/thumb.svg`);
    const meta = updated!.metadata as { widthM?: number; depthM?: number };
    expect(meta.widthM).toBeCloseTo(4, 2);
    expect(meta.depthM).toBeCloseTo(2, 2);
  });

  it('marks asset failed with error message on broken file', async () => {
    const created = (
      await request(app)
        .post('/api/assets')
        .set('Cookie', `access_token=${adminToken()}`)
        .attach('file', Buffer.from('0\nEOF\n'), 'bad.dxf')
    ).body;
    await convertQueue.idle();
    const res = await request(app)
      .get(`/api/assets/${created.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toBeTruthy();
  });

  it('products list includes asset status', async () => {
    const prod = await makeProduct();
    await request(app)
      .post('/api/assets')
      .set('Cookie', `access_token=${adminToken()}`)
      .field('productId', prod.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), 'block.dxf');
    await convertQueue.idle();
    const list = (await request(app)
      .get(`/api/products?projectId=${prod.projectId}`)
      .set('Cookie', `access_token=${adminToken()}`)).body;
    expect(list[0].asset.status).toBe('ready');
  });
});
