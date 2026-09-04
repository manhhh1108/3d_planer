import type { Point } from '$lib/models/types';
import { polygonFullyInside } from './zoneGeometry';
import { footprintRect } from './furnitureFootprint';

export interface ArrangeItem { id: string; width: number; depth: number; }
export interface ArrangeResult { id: string; position: Point; rotationDeg: number; placed: boolean; }

function bbox(poly: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Row/shelf packing các item vào bbox của vùng, chừa `margin` giữa item và với
 * mép; mỗi item thử 0° và 90°. Chỉ nhận vị trí mà footprint nằm TRỌN trong
 * polygon vùng. Item không lọt → placed=false (giữ nguyên ở tầng gọi).
 */
export function arrangeZone(zone: Point[], items: ArrangeItem[], margin: number): ArrangeResult[] {
  const { minX, minY, maxX, maxY } = bbox(zone);
  const sorted = [...items].sort((a, b) => Math.max(b.width, b.depth) - Math.max(a.width, a.depth));
  const results: ArrangeResult[] = [];
  let cursorX = minX + margin;
  let cursorY = minY + margin;
  let rowH = 0;

  for (const it of sorted) {
    let done = false;
    for (const rot of [0, 90]) {
      const w = rot === 0 ? it.width : it.depth;
      const h = rot === 0 ? it.depth : it.width;
      let cx = cursorX, cy = cursorY, rh = rowH;
      if (cx + w > maxX - margin) { cx = minX + margin; cy = cy + rh + margin; rh = 0; }
      if (cx + w > maxX - margin) continue;
      if (cy + h > maxY - margin) continue;
      const center = { x: cx + w / 2, y: cy + h / 2 };
      const foot = footprintRect(center, it.width, it.depth, rot);
      if (!polygonFullyInside(foot, zone)) continue;
      results.push({ id: it.id, position: center, rotationDeg: rot, placed: true });
      cursorX = cx + w + margin;
      cursorY = cy;
      rowH = Math.max(rh, h);
      done = true;
      break;
    }
    if (!done) results.push({ id: it.id, position: { x: 0, y: 0 }, rotationDeg: 0, placed: false });
  }
  return results;
}
