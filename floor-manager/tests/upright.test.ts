import { describe, it, expect } from 'vitest';
import { normalizeMeshesUpright } from '../server/cad/upright.js';
import type { CadMesh } from '../server/cad/geometry.js';

function box(w: number, d: number, h: number): CadMesh {
  const x = w / 2, y = d / 2, z = h / 2;
  const v = [
    [-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],
    [-x,-y, z],[x,-y, z],[x,y, z],[-x,y, z],
  ];
  const f = [
    [0,1,2],[0,2,3], [4,6,5],[4,7,6],
    [0,4,5],[0,5,1], [1,5,6],[1,6,2],
    [2,6,7],[2,7,3], [3,7,4],[3,4,0],
  ];
  return { positions: new Float32Array(v.flat()), indices: new Uint32Array(f.flat()) };
}

function rotate(mesh: CadMesh, axis: 'x' | 'y' | 'z', deg: number): CadMesh {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const p = Float32Array.from(mesh.positions as Float32Array);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    if (axis === 'z') { p[i] = x * c - y * s; p[i + 1] = x * s + y * c; }
    else if (axis === 'x') { p[i + 1] = y * c - z * s; p[i + 2] = y * s + z * c; }
    else { p[i] = x * c + z * s; p[i + 2] = -x * s + z * c; }
  }
  return { positions: p, indices: mesh.indices };
}

function aabb(mesh: CadMesh) {
  const p = mesh.positions as Float32Array;
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    mnx = Math.min(mnx, p[i]); mxx = Math.max(mxx, p[i]);
    mny = Math.min(mny, p[i + 1]); mxy = Math.max(mxy, p[i + 1]);
    mnz = Math.min(mnz, p[i + 2]); mxz = Math.max(mxz, p[i + 2]);
  }
  return { x: mxx - mnx, y: mxy - mny, z: mxz - mnz };
}

describe('normalizeMeshesUpright (Z-up)', () => {
  it('khoi da thang truc -> no-op, khong doi hinh', () => {
    const m = box(40, 20, 10);
    const before = aabb(m);
    const applied = normalizeMeshesUpright([m], 'z');
    expect(applied).toBe(false);
    const after = aabb(m);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
    expect(after.z).toBeCloseTo(before.z, 3);
  });

  it('khoi xoay 30 do quanh truc dung Z -> nan ve thang truc, giu kich thuoc', () => {
    const m = rotate(box(40, 20, 10), 'z', 30);
    const applied = normalizeMeshesUpright([m], 'z');
    expect(applied).toBe(true);
    const a = aabb(m);
    const dims = [a.x, a.y, a.z].sort((p, q) => p - q);
    expect(dims[0]).toBeCloseTo(10, 1);
    expect(dims[1]).toBeCloseTo(20, 1);
    expect(dims[2]).toBeCloseTo(40, 1);
  });

  it('khoi dung bi nghieng 25 do quanh X -> dung lai, GIU truc dung Z', () => {
    const m = rotate(box(10, 20, 40), 'x', 25);
    const applied = normalizeMeshesUpright([m], 'z');
    expect(applied).toBe(true);
    const a = aabb(m);
    expect(a.z).toBeCloseTo(40, 1);
    expect(a.z).toBeGreaterThan(a.x);
    expect(a.z).toBeGreaterThan(a.y);
  });

  it('nan la phep quay cung: the tich AABB khong phinh ra', () => {
    const m = rotate(box(40, 20, 10), 'z', 30);
    normalizeMeshesUpright([m], 'z');
    const a = aabb(m);
    expect(a.x * a.y * a.z).toBeCloseTo(40 * 20 * 10, 0);
  });
});
