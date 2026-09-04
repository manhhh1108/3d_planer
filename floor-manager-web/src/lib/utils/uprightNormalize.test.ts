import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeUprightQuaternion } from './uprightNormalize';

/** Lấy positions + indices từ một BoxGeometry. */
function box(w: number, h: number, d: number): { pos: number[]; idx: number[] } {
  const g = new THREE.BoxGeometry(w, h, d);
  const posAttr = g.attributes.position.array as ArrayLike<number>;
  const pos = Array.from(posAttr);
  const idx = g.index
    ? Array.from(g.index.array as ArrayLike<number>)
    : Array.from({ length: pos.length / 3 }, (_, i) => i);
  return { pos, idx };
}

/** Quay danh sách vị trí bằng quaternion. */
function rotate(pos: number[], q: THREE.Quaternion): number[] {
  const out = new Array(pos.length);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 3) {
    v.set(pos[i], pos[i + 1], pos[i + 2]).applyQuaternion(q);
    out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
  }
  return out;
}

function applyQ(pos: number[], q: THREE.Quaternion): number[] {
  return rotate(pos, q);
}

function angleOf(q: THREE.Quaternion): number {
  return 2 * Math.acos(Math.min(1, Math.abs(q.w)));
}

function aabbSize(pos: number[]): THREE.Vector3 {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < pos.length; i += 3) {
    min.x = Math.min(min.x, pos[i]); max.x = Math.max(max.x, pos[i]);
    min.y = Math.min(min.y, pos[i + 1]); max.y = Math.max(max.y, pos[i + 1]);
    min.z = Math.min(min.z, pos[i + 2]); max.z = Math.max(max.z, pos[i + 2]);
  }
  return max.sub(min);
}

describe('computeUprightQuaternion', () => {
  it('khối đã thẳng trục → identity (no-op)', () => {
    const { pos, idx } = box(4, 2, 1);
    const q = computeUprightQuaternion(pos, idx);
    expect(Math.abs(q.w)).toBeCloseTo(1, 3); // angle ≈ 0
  });

  it('khối xoay 30° quanh Y → chuẩn hóa đưa về thẳng trục', () => {
    const { pos, idx } = box(4, 2, 1);
    const qRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (30 * Math.PI) / 180);
    const rotated = rotate(pos, qRot);
    const q = computeUprightQuaternion(rotated, idx);
    // Có sửa thật (không phải identity)
    expect(angleOf(q)).toBeGreaterThan(0.1);
    // Sau khi áp q, mesh thẳng trục → chuẩn hóa lại = identity
    const corrected = applyQ(rotated, q);
    const q2 = computeUprightQuaternion(corrected, idx);
    expect(Math.abs(q2.w)).toBeCloseTo(1, 2);
    // Kích thước AABB trở lại 4×2×1 (theo trục)
    const s = aabbSize(corrected);
    const dims = [s.x, s.y, s.z].sort((a, b) => a - b);
    expect(dims[0]).toBeCloseTo(1, 1);
    expect(dims[1]).toBeCloseTo(2, 1);
    expect(dims[2]).toBeCloseTo(4, 1);
  });

  it('khối đứng bị NGHIÊNG (xoay quanh X) → dựng thẳng lại, GIỮ trục đứng', () => {
    // Cao theo Y = 4 (khối đứng), rộng 1 × sâu 2 (X,Z phân biệt để không suy biến)
    const { pos, idx } = box(1, 4, 2);
    const qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (25 * Math.PI) / 180);
    const tilted = rotate(pos, qTilt);
    const q = computeUprightQuaternion(tilted, idx);
    expect(angleOf(q)).toBeGreaterThan(0.1); // có sửa
    const corrected = applyQ(tilted, q);
    // Trục đứng được giữ: chiều cao (Y) vẫn là chiều lớn nhất ≈ 4
    const s = aabbSize(corrected);
    expect(s.y).toBeCloseTo(4, 1);
    expect(s.y).toBeGreaterThan(s.x);
    expect(s.y).toBeGreaterThan(s.z);
  });
});
