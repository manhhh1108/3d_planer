import { convexHull, footprintArea, type Footprint, type Ring } from './geometry.js';
import { dxfToGeometry, dxfHas3dSolid } from './convertDxfSvg.js';

/**
 * DXF text -> footprint. Ưu tiên các đường bao kín; nếu không có, lấy convex
 * hull của mọi đỉnh. unitScale override $INSUNITS.
 *
 * Hình học nằm trong block được mở rộng qua INSERT — bản vẽ CAD thực tế hầu
 * như luôn dựng bằng block, modelspace chỉ chứa vài INSERT.
 */
export function dxfToFootprint(dxfText: string, unitScale: number | undefined): Footprint {
  const { points: allPoints, closedRings } = dxfToGeometry(dxfText, unitScale);

  if (allPoints.length === 0) {
    // Dò trên text thô: dxf-parser bỏ qua 3DSOLID nên file 3D thuần trông như file rỗng.
    if (dxfHas3dSolid(dxfText)) {
      throw new Error('File DWG/DXF chứa mô hình 3D (3DSOLID) — không hỗ trợ. Vui lòng export sang định dạng STP hoặc IFC để upload.');
    }
    throw new Error('DXF không chứa hình học 2D (LWPOLYLINE/POLYLINE). Kiểm tra lại file.');
  }

  const rings: Ring[] = closedRings.length > 0 ? closedRings : [convexHull(allPoints)];

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
