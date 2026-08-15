import DxfParser from 'dxf-parser';
import { convexHull, footprintArea, type Footprint, type Ring } from './geometry.js';

// $INSUNITS -> mét
const INSUNITS_SCALE: Record<number, number> = {
  1: 0.0254, // inch
  2: 0.3048, // feet
  4: 0.001, // mm
  5: 0.01, // cm
  6: 1, // m
};

/**
 * DXF text -> footprint. Ưu tiên các LWPOLYLINE/POLYLINE đóng;
 * nếu không có, lấy convex hull của mọi đỉnh. unitScale override $INSUNITS.
 */
export function dxfToFootprint(dxfText: string, unitScale: number | undefined): Footprint {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfText);
  if (!dxf) throw new Error('DXF parse failed');

  const insunits = Number(dxf.header?.['$INSUNITS'] ?? 0);
  const scale = unitScale ?? INSUNITS_SCALE[insunits] ?? 0.001;

  const closedRings: Ring[] = [];
  const allPoints: [number, number][] = [];

  for (const e of dxf.entities ?? []) {
    const ent = e as { type: string; vertices?: { x: number; y: number }[]; shape?: boolean; closed?: boolean };
    if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices?.length) {
      const ring: Ring = ent.vertices.map((v) => [v.x * scale, v.y * scale]);
      for (const p of ring) allPoints.push(p);
      const isClosed = ent.shape === true || ent.closed === true;
      if (isClosed && ring.length >= 3) closedRings.push(ring);
    } else if (ent.vertices?.length) {
      for (const v of ent.vertices) allPoints.push([v.x * scale, v.y * scale]);
    }
  }

  // Phát hiện file 3D (3DSOLID/3DFACE) — không hỗ trợ, hướng dẫn dùng STP/IFC
  const has3D = (dxf.entities ?? []).some(
    (e) => e.type === '3DSOLID' || e.type === '3DFACE' || e.type === 'MESH'
  );
  if (allPoints.length === 0 && has3D) {
    throw new Error('File DWG/DXF chứa mô hình 3D (3DSOLID) — không hỗ trợ. Vui lòng export sang định dạng STP hoặc IFC để upload.');
  }
  if (allPoints.length === 0) throw new Error('DXF không chứa hình học 2D (LWPOLYLINE/POLYLINE). Kiểm tra lại file.');

  const rings = closedRings.length > 0 ? closedRings : [convexHull(allPoints)];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of allPoints) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const polygons = rings.map((ring) =>
    ring.map(([x, y]) => [
      Math.round((x - cx) * 10000) / 10000,
      Math.round((y - cy) * 10000) / 10000,
    ] as [number, number])
  );

  return {
    polygons,
    areaM2: Math.round(footprintArea(polygons) * 10000) / 10000,
    bbox: {
      lengthM: Math.round((maxX - minX) * 10000) / 10000,
      widthM: Math.round((maxY - minY) * 10000) / 10000,
      heightM: 0,
    },
  };
}
