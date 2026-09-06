import type { Point } from '$lib/models/types';
import { polygonFullyInside } from './zoneGeometry';
import { itemsCollide } from './collisionGeometry';
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

/** Cạnh phải / cạnh dưới của một footprint đã đặt. */
function maxOf(foot: Point[], axis: 'x' | 'y'): number {
  let m = -Infinity;
  for (const p of foot) if (p[axis] > m) m = p[axis];
  return m;
}

/**
 * Các toạ độ thử đặt trên một trục: lưới đều, CỘNG thêm mép của những item đã
 * đặt (dịch ra đúng một khoảng cách). Nhờ vế sau, item mới áp sát được item cũ
 * thay vì phải rơi vào mắt lưới gần nhất — xếp khít mà vẫn không phải quét lưới
 * mịn tới mức chậm.
 */
function axisCandidates(lo: number, hi: number, step: number, edges: number[]): number[] {
  if (hi < lo) return [];
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(v);
  for (const e of edges) if (e >= lo - 1e-9 && e <= hi + 1e-9) out.push(e);
  return [...new Set(out.map((v) => Math.round(v * 1e3) / 1e3))].sort((a, b) => a - b);
}

/** Trần số bước quét mỗi trục — chặn vùng khổng lồ làm treo trình duyệt. */
const MAX_STEPS = 400;

/**
 * Xếp item vào vùng: quét từ trên xuống, trái sang phải, đặt vào chỗ trống đầu
 * tiên hợp lệ. Mỗi item thử 0° và 90°. Chỉ nhận vị trí mà footprint nằm TRỌN
 * trong polygon vùng và cách mọi item đã đặt ít nhất `margin`.
 *
 * Phải QUÉT chứ không thể chạy một con trỏ theo hàng như trước: con trỏ khởi
 * động ở góc trên-trái của KHUNG BAO, mà với vùng vẽ xiên hay lõm thì góc đó
 * nằm ngoài đa giác. Bản cũ gặp chỗ không đặt được là bỏ luôn item, không thử
 * chỗ khác — nên một vùng nghiêng vài chục cm là không xếp nổi item nào, dù
 * còn thừa cả trăm mét vuông.
 *
 * Item không có chỗ nào lọt → placed=false (tầng gọi giữ nguyên vị trí cũ).
 */
export function arrangeZone(zone: Point[], items: ArrangeItem[], margin: number): ArrangeResult[] {
  const { minX, minY, maxX, maxY } = bbox(zone);
  const sorted = [...items].sort((a, b) => Math.max(b.width, b.depth) - Math.max(a.width, a.depth));
  const results: ArrangeResult[] = [];
  const placed: Point[][] = [];

  const step = Math.max(
    Math.min(margin, 50),           // đủ mịn để xếp khít
    (maxX - minX) / MAX_STEPS,      // nhưng không mịn tới mức nổ số ô
    (maxY - minY) / MAX_STEPS,
  );

  for (const it of sorted) {
    let done = false;
    for (const rot of [0, 90]) {
      const w = rot === 0 ? it.width : it.depth;
      const h = rot === 0 ? it.depth : it.width;
      const xs = axisCandidates(minX + margin, maxX - margin - w, step,
        placed.map((f) => maxOf(f, 'x') + margin));
      const ys = axisCandidates(minY + margin, maxY - margin - h, step,
        placed.map((f) => maxOf(f, 'y') + margin));

      search:
      for (const y of ys) {
        for (const x of xs) {
          const center = { x: x + w / 2, y: y + h / 2 };
          const foot = footprintRect(center, it.width, it.depth, rot);
          if (!polygonFullyInside(foot, zone)) continue;
          if (placed.some((f) => itemsCollide(foot, margin, f, margin))) continue;
          results.push({ id: it.id, position: center, rotationDeg: rot, placed: true });
          placed.push(foot);
          done = true;
          break search;
        }
      }
      if (done) break;
    }
    if (!done) results.push({ id: it.id, position: { x: 0, y: 0 }, rotationDeg: 0, placed: false });
  }
  return results;
}
