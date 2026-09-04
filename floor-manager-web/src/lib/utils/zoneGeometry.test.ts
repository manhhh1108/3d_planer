import { describe, it, expect } from 'vitest';
import { polygonArea, pointInPolygon, polygonCentroid, polygonFullyInside } from './zoneGeometry';

const square = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
];

describe('zoneGeometry', () => {
  it('polygonArea: hình vuông 100x100 = 10000', () => {
    expect(polygonArea(square)).toBeCloseTo(10000, 5);
  });

  it('polygonArea: bất biến theo chiều quay (CW hay CCW)', () => {
    const reversed = [...square].reverse();
    expect(polygonArea(reversed)).toBeCloseTo(10000, 5);
  });

  it('polygonArea: đa giác lõm (chữ L)', () => {
    const L = [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 },
      { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 },
    ];
    expect(polygonArea(L)).toBeCloseTo(300, 5);
  });

  it('pointInPolygon: trong / ngoài', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });

  it('polygonCentroid: tâm hình vuông = (50,50)', () => {
    const c = polygonCentroid(square);
    expect(c.x).toBeCloseTo(50, 5);
    expect(c.y).toBeCloseTo(50, 5);
  });
});

const bigSquare = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
];

describe('polygonFullyInside', () => {
  it('hình nhỏ nằm trọn trong hình lớn', () => {
    const small = [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 }];
    expect(polygonFullyInside(small, bigSquare)).toBe(true);
  });
  it('hình vắt qua biên -> false', () => {
    const crossing = [{ x: 90, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 40 }, { x: 90, y: 40 }];
    expect(polygonFullyInside(crossing, bigSquare)).toBe(false);
  });
  it('hình hoàn toàn bên ngoài -> false', () => {
    const outside = [{ x: 200, y: 200 }, { x: 220, y: 200 }, { x: 220, y: 220 }, { x: 200, y: 220 }];
    expect(polygonFullyInside(outside, bigSquare)).toBe(false);
  });
});
