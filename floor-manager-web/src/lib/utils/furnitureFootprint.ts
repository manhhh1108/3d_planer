import type { FurnitureItem, Point } from '$lib/models/types';
import { getCatalogItem } from './furnitureCatalog';

/**
 * 4 góc hình chữ nhật bao (width × depth) của block, đã xoay theo rotation,
 * đặt quanh tâm — world cm. Dùng làm footprint để kiểm tra "trọn trong vùng".
 * Cố ý dùng bbox (bao trùm footprint CAD) => an toàn: bbox-trọn ⇒ block-trọn.
 */
export function footprintRect(center: Point, width: number, depth: number, rotationDeg: number): Point[] {
  const hw = width / 2, hd = depth / 2;
  const t = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const local: Point[] = [
    { x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd },
  ];
  return local.map((p) => ({
    x: center.x + p.x * c - p.y * s,
    y: center.y + p.x * s + p.y * c,
  }));
}

/** Footprint của một FurnitureItem (dùng override kích thước nếu có). */
export function itemFootprint(item: FurnitureItem): Point[] {
  const cat = getCatalogItem(item.catalogId);
  const width = item.width ?? cat?.width ?? 50;
  const depth = item.depth ?? cat?.depth ?? 50;
  return footprintRect(item.position, width, depth, item.rotation ?? 0);
}
