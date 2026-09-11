import type { Point } from '$lib/models/types';

/** Diện tích đa giác (shoelace), trị tuyệt đối — cùng đơn vị bình phương với input. */
export function polygonArea(points: Point[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Điểm nằm trong đa giác? Ray-casting, xử lý được cả đa giác lõm. */
export function pointInPolygon(pt: Point, poly: Point[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Trọng tâm đa giác (area-weighted); thoái lui về trung bình đỉnh nếu suy biến. */
export function polygonCentroid(points: Point[]): Point {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0 };
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    const s = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: s.x / n, y: s.y / n };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Hai đoạn thẳng AB và CD có cắt nhau (giao thực sự, không tính chạm đầu mút)? */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** inner nằm TRỌN trong outer: mọi đỉnh inner ở trong VÀ không cạnh nào cắt biên outer. */
export function polygonFullyInside(inner: Point[], outer: Point[]): boolean {
  if (inner.length < 3 || outer.length < 3) return false;
  for (const p of inner) {
    if (!pointInPolygon(p, outer)) return false;
  }
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i], b = inner[(i + 1) % inner.length];
    for (let j = 0; j < outer.length; j++) {
      const c = outer[j], d = outer[(j + 1) % outer.length];
      if (segmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

/**
 * Khoảng cách nhỏ nhất từ điểm tới VIỀN đa giác (kể cả cạnh khép đỉnh cuối về
 * đỉnh đầu). Điểm nằm sâu bên trong vùng vẫn cho số lớn — đúng ý: chọn vùng chỉ
 * bằng cách bấm trúng viền, bấm vào phần tô bên trong thì coi như bấm nền.
 */
export function distanceToPolygonEdge(pt: Point, poly: Point[]): number {
  let best = Infinity;
  const n = poly.length;
  if (n < 2) return best;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    // Chiếu điểm lên đoạn rồi kẹp vào [0,1] — ra ngoài đoạn thì đo tới đầu mút.
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2));
    const d = Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
    if (d < best) best = d;
  }
  return best;
}
