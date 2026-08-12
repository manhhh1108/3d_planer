import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';

describe('projects', () => {
  it('lists projects with product count only', async () => {
    const proj = (await request(app).post('/api/projects').send({ name: 'P1' })).body;
    await request(app)
      .post('/api/products')
      .send({ projectId: proj.id, name: 'Block', code: 'B1' });

    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body[0]._count).toEqual({ products: 1 });
  });

  it('gets a project with products, without layouts', async () => {
    const proj = (await request(app).post('/api/projects').send({ name: 'P1' })).body;
    const res = await request(app).get(`/api/projects/${proj.id}`);
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
    expect(res.body.layouts).toBeUndefined();
  });
});
