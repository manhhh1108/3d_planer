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
