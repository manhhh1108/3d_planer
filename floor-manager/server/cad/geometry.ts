import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon } from 'polygon-clipping';

export interface CadMesh {
  positions: Float32Array | number[];
  indices: Uint32Array | number[];
}

export type Ring = [number, number][];

export interface Footprint {
  polygons: Ring[]; // các ring ngoài (đã canh tâm bbox tại 0,0), đơn vị mét
  areaM2: number;
  bbox: { lengthM: number; widthM: number; heightM: number };
}

const EPS = 1e-9;
// Trên số lượng tam giác này thì union quá chậm -> fallback convex hull
const HULL_FALLBACK_TRIANGLES = 20000;

function triArea(r: Ring): number {
  const [[ax, ay], [bx, by], [cx, cy]] = r;
  return Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
}

/** Diện tích shoelace của 1 ring (dương bất kể chiều). */
function ringArea(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Tổng diện tích các ring ngoài (bỏ qua chiều âm/dương — footprint chỉ giữ ring ngoài). */
export function footprintArea(polygons: Ring[]): number {
  return polygons.reduce((s, r) => s + Math.abs(ringArea(r)), 0);
}

/** Monotone chain convex hull. */
export function convexHull(points: [number, number][]): Ring {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 3) return pts;
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Chiếu mesh xuống mặt sàn và union các tam giác thành silhouette.
 * upAxis 'z': mặt sàn = XY (STEP/DXF). upAxis 'y': mặt sàn = XZ (web-ifc).
 * unitScale: hệ số đổi đơn vị file -> mét.
 */
export function meshesToFootprint(
  meshes: CadMesh[],
  unitScale: number,
  upAxis: 'z' | 'y'
): Footprint {
  // 1. Thu thập tam giác 2D (mét) + bbox 3D
  const tris: Ring[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let minH = Infinity, maxH = -Infinity;

  for (const mesh of meshes) {
    const pos = mesh.positions;
    const idx = mesh.indices;
    const proj = (vi: number): [number, number, number] => {
      const x = pos[vi * 3] * unitScale;
      const y = pos[vi * 3 + 1] * unitScale;
      const z = pos[vi * 3 + 2] * unitScale;
      // trả về [ngang1, ngang2, cao]
      // Y-up (web-ifc/glTF) sinh từ Z-up bằng (x,y,z)->(x,z,-y), nên đảo ngược:
      // ngang2 = -z để footprint KHÔNG bị lật gương so với nguồn Z-up.
      return upAxis === 'z' ? [x, y, z] : [x, -z, y];
    };
    for (let i = 0; i < idx.length; i += 3) {
      const a = proj(idx[i]);
      const b = proj(idx[i + 1]);
      const c = proj(idx[i + 2]);
      for (const v of [a, b, c]) {
        if (v[0] < minX) minX = v[0];
        if (v[0] > maxX) maxX = v[0];
        if (v[1] < minY) minY = v[1];
        if (v[1] > maxY) maxY = v[1];
        if (v[2] < minH) minH = v[2];
        if (v[2] > maxH) maxH = v[2];
      }
      const ring: Ring = [
        [a[0], a[1]],
        [b[0], b[1]],
        [c[0], c[1]],
      ];
      if (triArea(ring) > EPS) tris.push(ring);
    }
  }

  const bbox = {
    lengthM: Math.max(0, maxX - minX),
    widthM: Math.max(0, maxY - minY),
    heightM: Math.max(0, maxH - minH),
  };
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  let outerRings: Ring[];
  if (tris.length === 0) {
    outerRings = [];
  } else if (tris.length > HULL_FALLBACK_TRIANGLES) {
    const pts: [number, number][] = tris.flat() as [number, number][];
    outerRings = [convexHull(pts)];
  } else {
    // 2. Union theo lô để tránh call stack/độ chậm của union 1 phát
    let acc: MultiPolygon = [];
    const BATCH = 200;
    for (let i = 0; i < tris.length; i += BATCH) {
      const batch = tris.slice(i, i + BATCH).map((t) => [t] as Polygon);
      acc = acc.length === 0
        ? polygonClipping.union(batch[0], ...batch.slice(1))
        : polygonClipping.union(acc, ...batch);
    }
    // 3. Chỉ giữ ring ngoài (ring đầu mỗi polygon); bỏ lỗ — chiếm dụng sàn tính cả lỗ
    outerRings = acc.map((poly) => poly[0] as Ring);
  }

  // 4. Canh tâm bbox tại (0,0), làm tròn 0.1mm
  const polygons = outerRings.map((ring) =>
    ring.map(([x, y]) => [
      Math.round((x - cx) * 10000) / 10000,
      Math.round((y - cy) * 10000) / 10000,
    ] as [number, number])
  );

  return { polygons, areaM2: Math.round(footprintArea(polygons) * 10000) / 10000, bbox: {
    lengthM: Math.round(bbox.lengthM * 10000) / 10000,
    widthM: Math.round(bbox.widthM * 10000) / 10000,
    heightM: Math.round(bbox.heightM * 10000) / 10000,
  } };
}

/** SVG thumbnail từ footprint (viewBox theo bbox, nền trong suốt). */
export function footprintToSvg(fp: Footprint, color: string): string {
  const w = Math.max(fp.bbox.lengthM, 0.001);
  const h = Math.max(fp.bbox.widthM, 0.001);
  const pad = Math.max(w, h) * 0.05;
  const d = fp.polygons
    .map((ring) =>
      ring.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(4)} ${(-y).toFixed(4)}`).join(' ') + ' Z'
    )
    .join(' ');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(-w / 2 - pad).toFixed(4)} ${(-h / 2 - pad).toFixed(4)} ${(w + 2 * pad).toFixed(4)} ${(h + 2 * pad).toFixed(4)}">` +
    `<path d="${d}" fill="${color}" fill-opacity="0.85" stroke="#1e293b" stroke-width="${(Math.max(w, h) * 0.01).toFixed(4)}"/>` +
    `</svg>`
  );
}
