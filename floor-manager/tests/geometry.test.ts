import { describe, it, expect } from 'vitest';
import {
  meshesToFootprint,
  footprintArea,
  footprintToSvg,
  convexHull,
  type CadMesh,
} from '../server/cad/geometry.js';

// Hộp 4000 x 2000 x 1000 (đơn vị file = mm), Z-up, đáy tại z=0, góc tại gốc tọa độ
function boxMesh(l = 4000, w = 2000, h = 1000): CadMesh {
  const p = [
    0, 0, 0,  l, 0, 0,  l, w, 0,  0, w, 0, // đáy
    0, 0, h,  l, 0, h,  l, w, h,  0, w, h, // đỉnh
  ];
  const idx = [
    0, 2, 1, 0, 3, 2, // đáy
    4, 5, 6, 4, 6, 7, // đỉnh
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ];
  return { positions: new Float32Array(p), indices: new Uint32Array(idx) };
}

describe('meshesToFootprint', () => {
  it('projects a z-up box to a 4x2 m footprint centered at origin', () => {
    const fp = meshesToFootprint([boxMesh()], 0.001, 'z');
    expect(fp.bbox.lengthM).toBeCloseTo(4, 3);
    expect(fp.bbox.widthM).toBeCloseTo(2, 3);
    expect(fp.bbox.heightM).toBeCloseTo(1, 3);
    expect(fp.areaM2).toBeCloseTo(8, 2);
    // polygon canh tâm: mọi đỉnh nằm trong [-2,2]x[-1,1]
    for (const ring of fp.polygons) {
      for (const [x, y] of ring) {
        expect(Math.abs(x)).toBeLessThanOrEqual(2.001);
        expect(Math.abs(y)).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it('supports y-up meshes (IFC style)', () => {
    // hộp y-up: chiều cao theo trục Y — hoán vị y/z của boxMesh
    const m = boxMesh();
    const pos = m.positions as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const y = pos[i + 1];
      pos[i + 1] = pos[i + 2];
      pos[i + 2] = y;
    }
    const fp = meshesToFootprint([m], 0.001, 'y');
    expect(fp.bbox.lengthM).toBeCloseTo(4, 3);
    expect(fp.bbox.heightM).toBeCloseTo(1, 3);
    expect(fp.areaM2).toBeCloseTo(8, 2);
  });

  it('unions two separated boxes into two polygons', () => {
    const a = boxMesh(1000, 1000, 500);
    const b = boxMesh(1000, 1000, 500);
    const pb = b.positions as Float32Array;
    for (let i = 0; i < pb.length; i += 3) pb[i] += 5000; // dịch 5m theo x
    const fp = meshesToFootprint([a, b], 0.001, 'z');
    expect(fp.polygons.length).toBe(2);
    expect(fp.areaM2).toBeCloseTo(2, 2);
    expect(fp.bbox.lengthM).toBeCloseTo(6, 3);
  });
});

describe('footprintArea', () => {
  it('computes shoelace area for a simple ring', () => {
    expect(footprintArea([[[0, 0], [4, 0], [4, 2], [0, 2]]])).toBeCloseTo(8, 6);
  });
});

describe('convexHull', () => {
  it('returns hull of a point cloud', () => {
    const hull = convexHull([
      [0, 0], [4, 0], [4, 2], [0, 2], [2, 1], [1, 0.5],
    ]);
    expect(hull.length).toBe(4);
  });
});

describe('footprintToSvg', () => {
  it('emits an svg string containing a path', () => {
    const fp = meshesToFootprint([boxMesh()], 0.001, 'z');
    const svg = footprintToSvg(fp, '#58a6ff');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
  });
});
