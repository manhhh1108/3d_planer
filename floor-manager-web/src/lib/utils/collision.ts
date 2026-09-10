import type { FurnitureItem, Point } from '$lib/models/types';
import { itemOutline } from './furnitureFootprint';
import { itemsCollide, toRings, type Outline } from './collisionGeometry';
import { getDefaultMarginCm } from '$lib/stores/appSettings';

/** Margin hiệu lực của item = override per-item, else global. */
export function effectiveMargin(item: FurnitureItem): number {
  return item.marginCm ?? getDefaultMarginCm();
}

/** Vòng lặp so cặp, tách riêng để phần nhớ kết quả bên dưới dùng lại được. */
function collidePrepared(ids: string[], margins: number[], foots: Outline[]): Set<string> {
  const hit = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (itemsCollide(foots[i], margins[i], foots[j], margins[j])) {
        hit.add(ids[i]); hit.add(ids[j]);
      }
    }
  }
  return hit;
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
  return collidePrepared(
    items.map((it) => it.id),
    items.map((it) => marginOf(it)),
    items.map((it) => footOf(it)),
  );
}

/** Đầu vào thật của phép so cặp — đủ để quyết định có phải tính lại hay không. */
type Prepared = { ids: string[]; margins: number[]; rings: Point[][][] };

let prev: Prepared | null = null;
let prevResult = new Set<string>();

/** So khớp TUYỆT ĐỐI, không băm: băm 32-bit có thể đụng độ và trả về kết quả cũ. */
function sameAsPrev(cur: Prepared): boolean {
  if (!prev || prev.ids.length !== cur.ids.length) return false;
  for (let i = 0; i < cur.ids.length; i++) {
    if (prev.ids[i] !== cur.ids[i] || prev.margins[i] !== cur.margins[i]) return false;
    const a = prev.rings[i], b = cur.rings[i];
    if (a.length !== b.length) return false;
    for (let r = 0; r < a.length; r++) {
      if (a[r].length !== b[r].length) return false;
      for (let k = 0; k < a[r].length; k++) {
        if (a[r][k].x !== b[r][k].x || a[r][k].y !== b[r][k].y) return false;
      }
    }
  }
  return true;
}

/**
 * Tiện dụng cho canvas: tính va chạm cho furniture của 1 floor, có nhớ kết quả.
 *
 * Canvas gọi hàm này từ `activeFloor.subscribe`, mà `activeFloor` là derived
 * store của `currentProject` — Svelte `derived` phát lại trên MỌI lần `set` chứ
 * không so giá trị. Nghĩa là mỗi mousemove khi kéo bất cứ thứ gì (kể cả kéo một
 * VÙNG, vốn không thể làm block va nhau khác đi) đều kéo theo một lượt O(n²).
 * Đo trên bãi 190×105m: 200 block ≈ 64 ms, 800 block ≈ 1,9 s, 1600 ≈ 7 s.
 *
 * Chữ ký lấy từ ĐẦU VÀO ĐÃ TÍNH (biên dạng + margin) chứ không từ danh sách
 * trường của item: `itemOutline` còn phụ thuộc catalog (kích thước, footprint
 * CAD tải về sau), liệt kê tay là sớm muộn cũng sót một nguồn rồi trả kết quả
 * cũ. Dựng biên dạng là O(n) — không đáng gì so với O(n²) mà nó cắt được.
 */
export function collisionsForFurniture(items: FurnitureItem[]): Set<string> {
  const cur: Prepared = {
    ids: items.map((it) => it.id),
    margins: items.map(effectiveMargin),
    rings: items.map((it) => toRings(itemOutline(it))),
  };
  if (sameAsPrev(cur)) return prevResult;
  prev = cur;
  prevResult = collidePrepared(cur.ids, cur.margins, cur.rings);
  return prevResult;
}
