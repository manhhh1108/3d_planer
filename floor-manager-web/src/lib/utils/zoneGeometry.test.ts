import { describe, it, expect } from 'vitest';
import { polygonArea, pointInPolygon, polygonCentroid } from './zoneGeometry';

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
