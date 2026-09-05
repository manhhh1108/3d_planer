import type { FurnitureItem } from '$lib/models/types';
import { itemOutline } from './furnitureFootprint';
import { itemsCollide, type Outline } from './collisionGeometry';
import { getDefaultMarginCm } from '$lib/stores/appSettings';

/** Margin hiệu lực của item = override per-item, else global. */
export function effectiveMargin(item: FurnitureItem): number {
  return item.marginCm ?? getDefaultMarginCm();
}

/**
 * Tập id các item đang va chạm với ≥1 item khác. O(n²) — đủ cho quy mô hiện tại.
 * marginOf/footOf tách ra để test thuần (không phụ thuộc store); biên dạng và
 * margin tính trước một lần vì với biên dạng CAD thật việc dựng lại trong vòng
 * lặp trong sẽ tốn gấp n lần.
 */
export function computeCollisions<T extends { id: string }>(
  items: T[],
  marginOf: (it: T) => number,
  footOf: (it: T) => Outline,
): Set<string> {
  const hit = new Set<string>();
  const margins = items.map(marginOf);
  const foots = items.map(footOf);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (itemsCollide(foots[i], margins[i], foots[j], margins[j])) {
        hit.add(items[i].id); hit.add(items[j].id);
      }
    }
  }
  return hit;
}

/** Tiện dụng cho canvas: tính va chạm cho furniture của 1 floor. */
export function collisionsForFurniture(items: FurnitureItem[]): Set<string> {
  return computeCollisions(items, effectiveMargin, itemOutline);
}
