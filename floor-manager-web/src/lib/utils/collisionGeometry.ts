import type { Point } from '$lib/models/types';

function sub(a: Point, b: Point): Point { return { x: a.x - b.x, y: a.y - b.y }; }
function norm(v: Point): Point { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }

/** Nới hình chữ nhật xoay (4 đỉnh theo thứ tự) ra `m` mỗi phía theo 2 cạnh của nó. */
export function inflateRect(r: Point[], m: number): Point[] {
  const u = norm(sub(r[1], r[0])); // cạnh 0->1
  const v = norm(sub(r[3], r[0])); // cạnh 0->3
  const off = (su: number, sv: number, p: Point): Point => ({
    x: p.x + su * m * u.x + sv * m * v.x,
    y: p.y + su * m * u.y + sv * m * v.y,
  });
  return [off(-1, -1, r[0]), off(1, -1, r[1]), off(1, 1, r[2]), off(-1, 1, r[3])];
}

/** SAT: hai đa giác LỒI có chồng nhau không (chạm mép = không chồng). */
export function convexPolysOverlap(a: Point[], b: Point[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x }; // pháp tuyến cạnh
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of a) { const d = p.x * axis.x + p.y * axis.y; if (d < minA) minA = d; if (d > maxA) maxA = d; }
      for (const p of b) { const d = p.x * axis.x + p.y * axis.y; if (d < minB) minB = d; if (d > maxB) maxB = d; }
      if (maxA <= minB || maxB <= minA) return false; // có trục tách (chạm mép cũng tách)
    }
  }
  return true;
}

/** Va chạm khi khe hở < max(marginA, marginB), hoặc footprint chồng thật. */
export function itemsCollide(footA: Point[], marginA: number, footB: Point[], marginB: number): boolean {
  return convexPolysOverlap(inflateRect(footA, marginA), footB)
      || convexPolysOverlap(inflateRect(footB, marginB), footA);
}
