import type { FurnitureItem, Point } from '$lib/models/types';
import { itemFootprint } from './furnitureFootprint';
import { itemsCollide } from './collisionGeometry';
import { getDefaultMarginCm } from '$lib/stores/appSettings';

/** Margin hiệu lực của item = override per-item, else global. */
export function effectiveMargin(item: FurnitureItem): number {
  return item.marginCm ?? getDefaultMarginCm();
}

/**
 * Tập id các item đang va chạm với ≥1 item khác. O(n²) — đủ cho quy mô hiện tại.
 * marginOf/footOf tách ra để test thuần (không phụ thuộc store).
 */
export function computeCollisions<T extends { id: string }>(
  items: T[],
  marginOf: (it: T) => number,
  footOf: (it: T) => Point[],
): Set<string> {
  const hit = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (itemsCollide(footOf(a), marginOf(a), footOf(b), marginOf(b))) {
        hit.add(a.id); hit.add(b.id);
      }
    }
  }
  return hit;
}

/** Tiện dụng cho canvas: tính va chạm cho furniture của 1 floor. */
export function collisionsForFurniture(items: FurnitureItem[]): Set<string> {
  return computeCollisions(items, effectiveMargin, itemFootprint);
}
