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

/**
 * Biên dạng thật của block trong toạ độ world (cm): các ring CAD đã co giãn
 * theo kích thước người dùng gõ, lật theo mặt tiếp sàn rồi xoay + dời về vị trí.
 *
 * Chỉ dùng được khi block NẰM ĐÁY (bottom/top): lật nghiêng hay dựng đứng thì
 * hình chiếu bằng là hình khác hẳn mà dữ liệu đó không có — khi đó (và khi
 * không có footprint CAD) trả về chữ nhật bao, đúng như những gì canvas vẽ.
 *
 * Ring CAD theo quy ước y HƯỚNG LÊN của bản vẽ, còn toạ độ editor y hướng
 * xuống, nên phải đổi dấu y — giống hệt bước vẽ trong canvasRenderer.
 */
export function itemOutline(item: FurnitureItem): Point[][] {
  const cat = getCatalogItem(item.catalogId);
  const width = item.width ?? cat?.width ?? 50;
  const depth = item.depth ?? cat?.depth ?? 50;
  const orientation = item.orientation ?? 'bottom';
  const laidFlat = orientation === 'bottom' || orientation === 'top';
  const usable = (cat?.footprint ?? []).filter((ring) => ring.length >= 3);
  const bbox = () => [footprintRect(item.position, width, depth, item.rotation ?? 0)];

  if (!cat || !laidFlat || usable.length === 0) return bbox();

  const kx = width / (cat.width || 1);
  const ky = depth / (cat.depth || 1);
  const mirrorY = orientation === 'top' ? -1 : 1;
  const t = ((item.rotation ?? 0) * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);

  return usable.map((ring) =>
    ring.map(([fx, fy]) => {
      const lx = fx * kx;
      const ly = -fy * ky * mirrorY;
      return {
        x: item.position.x + lx * c - ly * s,
        y: item.position.y + lx * s + ly * c,
      };
    }),
  );
}
