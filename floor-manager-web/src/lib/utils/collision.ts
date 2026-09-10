import type { FurnitureItem, Point } from '$lib/models/types';
import { itemOutline } from './furnitureFootprint';
import { itemsCollide, toRings, type Outline } from './collisionGeometry';
import { getDefaultMarginCm } from '$lib/stores/appSettings';

/** Margin hiệu lực của item = override per-item, else global. */
export function effectiveMargin(item: FurnitureItem): number {
  return item.marginCm ?? getDefaultMarginCm();
}

/**
 * So cặp qua lưới không gian. Tách riêng để phần nhớ kết quả bên dưới dùng lại.
 *
 * Vét cạn là O(n²): đo trên bãi 190×105m thì 800 block mất 1,9 s và 1600 block
 * mất 7,1 s — đủ để trang không mở nổi, vì lượt đầu tiên thì bộ nhớ đệm không
 * đỡ được.
 *
 * Lọc thô: mỗi block một hộp bao nở ra đúng margin CỦA CHÍNH NÓ, rồi chỉ so
 * những block chung ô lưới. Bộ lọc bao trùm, không bao giờ bỏ sót:
 * `itemsCollide` đúng khi chồng nhau hoặc khe hở < max(mA,mB); nếu hai hộp đã
 * nở mà tách rời trên một trục thì khoảng cách giữa chúng > mA+mB ≥ max(mA,mB),
 * tức chắc chắn không va chạm.
 *
 * Cạnh ô lấy bằng hộp bao lớn nhất, nên mỗi block phủ tối đa 2×2 ô — bộ nhớ
 * chặn trên O(n), không thể phình. Đánh đổi: một block khổng lồ sẽ làm lưới thô
 * đi và suy biến về vét cạn — vẫn đúng, chỉ mất phần tăng tốc.
 */
function collidePrepared(ids: string[], margins: number[], foots: Outline[]): Set<string> {
  const hit = new Set<string>();
  const n = ids.length;
  if (n < 2) return hit;

  const minX = new Float64Array(n), minY = new Float64Array(n);
  const maxX = new Float64Array(n), maxY = new Float64Array(n);
  const skip = new Uint8Array(n);
  let cell = 0;
  for (let i = 0; i < n; i++) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ring of toRings(foots[i])) {
      for (const p of ring) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
    }
    // Biên dạng rỗng: outlinesGap trả Infinity nên không bao giờ va chạm.
    if (!Number.isFinite(x0)) { skip[i] = 1; continue; }
    const m = margins[i];
    minX[i] = x0 - m; minY[i] = y0 - m; maxX[i] = x1 + m; maxY[i] = y1 + m;
    const d = Math.max(maxX[i] - minX[i], maxY[i] - minY[i]);
    if (d > cell) cell = d;
  }
  if (!(cell > 0)) cell = 1; // mọi block suy biến thành điểm

  const grid = new Map<number, Map<number, number[]>>();
  const put = (cx: number, cy: number, i: number) => {
    let col = grid.get(cx);
    if (!col) { col = new Map(); grid.set(cx, col); }
    const bucket = col.get(cy);
    if (bucket) bucket.push(i); else col.set(cy, [i]);
  };
  for (let i = 0; i < n; i++) {
    if (skip[i]) continue;
    const cx0 = Math.floor(minX[i] / cell), cx1 = Math.floor(maxX[i] / cell);
    const cy0 = Math.floor(minY[i] / cell), cy1 = Math.floor(maxY[i] / cell);
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) put(cx, cy, i);
  }

  // Một cặp có thể chung nhiều ô; so hình học là phần đắt nên chặn lặp lại.
  const done = new Set<number>();
  for (const col of grid.values()) {
    for (const bucket of col.values()) {
      for (let a = 0; a < bucket.length; a++) {
        for (let b = a + 1; b < bucket.length; b++) {
          const i = bucket[a], j = bucket[b];
          const key = i < j ? i * n + j : j * n + i;
          if (done.has(key)) continue;
          done.add(key);
          if (maxX[i] < minX[j] || maxX[j] < minX[i]) continue;
          if (maxY[i] < minY[j] || maxY[j] < minY[i]) continue;
          if (itemsCollide(foots[i], margins[i], foots[j], margins[j])) {
            hit.add(ids[i]); hit.add(ids[j]);
          }
        }
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
