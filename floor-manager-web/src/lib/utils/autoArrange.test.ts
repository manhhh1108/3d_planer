import { describe, it, expect } from 'vitest';
import { arrangeZone } from './autoArrange';
import { itemsCollide } from './collisionGeometry';
import { footprintRect } from './furnitureFootprint';
import { polygonFullyInside } from './zoneGeometry';
import type { Point } from '$lib/models/types';

const rectZone = (w: number, h: number): Point[] => [
  { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
];

describe('arrangeZone', () => {
  it('xếp 4 item 100x100 trong vùng 1000x1000: đều đặt được, trong vùng, không va chạm', () => {
    const zone = rectZone(1000, 1000);
    const items = [1, 2, 3, 4].map((n) => ({ id: `i${n}`, width: 100, depth: 100 }));
    const res = arrangeZone(zone, items, 20);
    expect(res.every((r) => r.placed)).toBe(true);
    for (const r of res) {
      const f = footprintRect(r.position, 100, 100, r.rotationDeg);
      expect(polygonFullyInside(f, zone)).toBe(true);
    }
    for (let i = 0; i < res.length; i++)
      for (let j = i + 1; j < res.length; j++) {
        const fi = footprintRect(res[i].position, 100, 100, res[i].rotationDeg);
        const fj = footprintRect(res[j].position, 100, 100, res[j].rotationDeg);
        expect(itemsCollide(fi, 20, fj, 20)).toBe(false);
      }
  });
  it('item to hơn vùng → placed=false', () => {
    const zone = rectZone(500, 500);
    const res = arrangeZone(zone, [{ id: 'big', width: 900, depth: 900 }], 10);
    expect(res[0].placed).toBe(false);
  });
  it('vùng hẹp: item chỉ lọt khi xoay 90°', () => {
    const zone = rectZone(300, 1000);
    const res = arrangeZone(zone, [{ id: 'bar', width: 900, depth: 250 }], 10);
    expect(res[0].placed).toBe(true);
    expect(res[0].rotationDeg).toBe(90);
  });
});
