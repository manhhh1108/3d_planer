import type { Point } from '$lib/models/types';

/**
 * Biên dạng của một block: một hoặc nhiều ring NGOÀI (không có lỗ — converter
 * CAD chỉ giữ ring ngoài, xem `Footprint.polygons` bên server). Nhiều ring =
 * nhiều mảnh rời của cùng một sản phẩm; phần đặc là HỢP của các ring.
 *
 * Nhận cả một ring trần cho gọn ở chỗ gọi (và cho khối hộp thường).
 */
export type Outline = Point[] | Point[][];

const EPS = 1e-9;

/** Đưa Outline về dạng danh sách ring. */
export function toRings(o: Outline): Point[][] {
  if (o.length === 0) return [];
  return Array.isArray(o[0]) ? (o as Point[][]) : [o as Point[]];
}

// Biên dạng CAD thật hay lõm (chữ L, chữ U) nên SAT — vốn chỉ đúng với đa giác
// lồi — sẽ báo va chạm ở phần lõm rỗng. Thay bằng: chồng thật (cạnh cắt nhau
// hoặc lồng nhau) HOẶC khe hở nhỏ hơn margin. Khe hở đo bằng khoảng cách nhỏ
// nhất giữa hai biên, đúng nghĩa "nới biên dạng ra `margin`" mà không phải dựng
// đa giác offset (offset đa giác lõm rất dễ tự cắt).

/** Khoảng cách từ điểm tới đoạn thẳng. */
function pointSegDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Hai đoạn cắt nhau thật sự (chạm đầu mút/chồng lên nhau KHÔNG tính). */
function segmentsProperlyIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b);
  const d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Khoảng cách nhỏ nhất giữa hai đoạn thẳng (0 nếu cắt nhau). */
function segSegDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsProperlyIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegDistance(a, c, d), pointSegDistance(b, c, d),
    pointSegDistance(c, a, b), pointSegDistance(d, a, b),
  );
}

/** Điểm nằm trong ring? Ray-casting, đúng cả với ring lõm. */
function pointInRing(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y;
    const xj = ring[j].x, yj = ring[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Điểm cách biên của mọi ring quá gần -> coi như nằm TRÊN biên, không phải trong. */
function pointOnBoundary(p: Point, rings: Point[][], eps = 1e-7): boolean {
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      if (pointSegDistance(p, ring[i], ring[(i + 1) % ring.length]) <= eps) return true;
    }
  }
  return false;
}

/**
 * Điểm nằm HẲN bên trong phần đặc (hợp của các ring ngoài).
 * Loại điểm nằm trên biên để hai block chạm mép không bị tính là chồng nhau —
 * giữ đúng quy ước "chạm mép = chưa va chạm" của bản SAT cũ.
 */
function pointStrictlyInside(p: Point, rings: Point[][]): boolean {
  if (pointOnBoundary(p, rings)) return false;
  return rings.some((ring) => pointInRing(p, ring));
}

/**
 * Điểm dò của một ring: các đỉnh VÀ trung điểm mỗi cạnh.
 *
 * Chỉ dò đỉnh là thiếu: hai chữ nhật đè lên nhau một dải nhưng cạnh dưới/trên
 * trùng phương (A 0..10, B 5..15 cùng dải y) thì mọi đỉnh của cái này đều nằm
 * ĐÚNG TRÊN biên cái kia, không đỉnh nào ở hẳn bên trong, và không cặp cạnh nào
 * cắt nhau thật sự — chồng nhau rõ ràng mà vẫn lọt lưới. Trung điểm cạnh rơi
 * hẳn vào trong nên bắt được, đồng thời vẫn nằm trên biên khi hai khối chỉ chạm
 * mép, nên không làm hỏng quy ước "chạm mép = chưa va chạm".
 */
function probePoints(ring: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    out.push(p, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  }
  return out;
}

/** Hai biên dạng chồng lên nhau (cắt nhau hoặc cái này nằm trong cái kia). */
export function outlinesOverlap(a: Outline, b: Outline): boolean {
  const A = toRings(a), B = toRings(b);
  for (const ra of A) {
    for (let i = 0; i < ra.length; i++) {
      const a1 = ra[i], a2 = ra[(i + 1) % ra.length];
      for (const rb of B) {
        for (let j = 0; j < rb.length; j++) {
          if (segmentsProperlyIntersect(a1, a2, rb[j], rb[(j + 1) % rb.length])) return true;
        }
      }
    }
  }
  for (const ra of A) if (probePoints(ra).some((p) => pointStrictlyInside(p, B))) return true;
  for (const rb of B) if (probePoints(rb).some((p) => pointStrictlyInside(p, A))) return true;
  return false;
}

/** Khe hở nhỏ nhất giữa hai biên dạng (0 khi biên cắt nhau). */
export function outlinesGap(a: Outline, b: Outline): number {
  const A = toRings(a), B = toRings(b);
  let best = Infinity;
  for (const ra of A) {
    for (let i = 0; i < ra.length; i++) {
      const a1 = ra[i], a2 = ra[(i + 1) % ra.length];
      for (const rb of B) {
        for (let j = 0; j < rb.length; j++) {
          const d = segSegDistance(a1, a2, rb[j], rb[(j + 1) % rb.length]);
          if (d < best) best = d;
          if (best <= 0) return 0;
        }
      }
    }
  }
  return best;
}

/**
 * Va chạm khi khe hở giữa hai BIÊN DẠNG nhỏ hơn max(marginA, marginB), hoặc hai
 * biên dạng chồng thật. Chạm mép với margin 0 vẫn coi là chưa va chạm.
 */
export function itemsCollide(footA: Outline, marginA: number, footB: Outline, marginB: number): boolean {
  if (outlinesOverlap(footA, footB)) return true;
  return outlinesGap(footA, footB) < Math.max(marginA, marginB);
}
