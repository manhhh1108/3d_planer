import type { Point, WorkingZone } from '$lib/models/types';
import { polygonArea, polygonFullyInside } from './zoneGeometry';

/** Vùng nhỏ nhất chứa TRỌN footprint; null nếu không vùng nào chứa trọn. */
export function resolveZoneForItem(footprint: Point[], zones: WorkingZone[]): WorkingZone | null {
  let best: WorkingZone | null = null;
  let bestArea = Infinity;
  for (const z of zones) {
    if (z.points.length >= 3 && polygonFullyInside(footprint, z.points)) {
      const a = polygonArea(z.points);
      if (a < bestArea) { bestArea = a; best = z; }
    }
  }
  return best;
}
