import { describe, it, expect } from 'vitest';
import { inflateRect, convexPolysOverlap, itemsCollide } from './collisionGeometry';

const rect = (x: number, y: number, w: number, h: number) => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];

describe('collisionGeometry', () => {
  it('inflateRect nới đều theo cạnh', () => {
    const r = inflateRect(rect(0, 0, 10, 4), 2);
    expect(r[0]).toEqual({ x: -2, y: -2 });
    expect(r[2]).toEqual({ x: 12, y: 6 });
  });
  it('convexPolysOverlap: chồng / rời', () => {
    expect(convexPolysOverlap(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
    expect(convexPolysOverlap(rect(0, 0, 10, 10), rect(50, 50, 10, 10))).toBe(false);
  });
  it('itemsCollide theo max(margin)', () => {
    const a = rect(0, 0, 10, 10), b = rect(60, 0, 10, 10); // gap 50, chạm mép sau khi nới → chưa va chạm
    expect(itemsCollide(a, 50, b, 50)).toBe(false);
    const c = rect(0, 0, 10, 10), d = rect(70, 0, 10, 10); // gap 60
    expect(itemsCollide(c, 50, d, 50)).toBe(false);
    const e = rect(0, 0, 10, 10), f = rect(30, 0, 10, 10); // gap 20 < 50
    expect(itemsCollide(e, 50, f, 50)).toBe(true);
    const g = rect(0, 0, 10, 10), h = rect(5, 0, 10, 10); // overlap thật
    expect(itemsCollide(g, 0, h, 0)).toBe(true);
  });
});
