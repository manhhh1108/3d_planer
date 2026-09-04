import { describe, it, expect } from 'vitest';
import { footprintRect } from './furnitureFootprint';

describe('footprintRect', () => {
  it('không xoay: 4 góc quanh tâm', () => {
    const pts = footprintRect({ x: 100, y: 100 }, 40, 20, 0);
    expect(pts).toEqual([
      { x: 80, y: 90 }, { x: 120, y: 90 }, { x: 120, y: 110 }, { x: 80, y: 110 },
    ]);
  });
  it('xoay 90°: rộng/sâu hoán đổi', () => {
    const pts = footprintRect({ x: 0, y: 0 }, 40, 20, 90);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    expect(Math.round(Math.max(...xs) - Math.min(...xs))).toBe(20);
    expect(Math.round(Math.max(...ys) - Math.min(...ys))).toBe(40);
  });
});
