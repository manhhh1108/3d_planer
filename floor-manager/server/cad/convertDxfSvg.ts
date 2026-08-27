import DxfParser from 'dxf-parser';

const INSUNITS_SCALE: Record<number, number> = {
  1: 0.0254,
  2: 0.3048,
  4: 0.001,
  5: 0.01,
  6: 1,
};

export interface DxfInsertData {
  blockName: string;
  xCm: number;
  yCm: number;
  rotationDeg: number;
  svgPreview: string;
  /**
   * Layer của INSERT. Tên block trong bản vẽ thật thường là mã sinh tự động
   * ("A$C0C3937EC"), còn layer lại do người vẽ đặt ("EVERGREEN", "22-CAT_2")
   * nên đây thường là manh mối đọc được duy nhất.
   */
  layer: string;
  /** Kích thước block khi đã đặt xuống bản vẽ (đã nhân tỉ lệ của INSERT), cm */
  widthCm: number;
  heightCm: number;
}

export interface DxfSvgResult {
  svg: string;
  widthM: number;
  heightM: number;
  inserts: DxfInsertData[];
}

interface RenderResult {
  elements: string[];
  points: [number, number][];
  /** Đường bao kín (polyline/polygon đóng, đường tròn) — dùng dựng footprint. */
  rings: [number, number][][];
}

/** Ma trận affine 2D [a,b,c,d,e,f]: x' = a·x + c·y + e, y' = b·x + d·y + f */
type Mat = [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** m1 ∘ m2 — m2 áp trước, m1 áp sau */
function matMul(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function matApply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Hệ số phóng đại trung bình — dùng cho bán kính đường tròn/cung. */
function matScaleFactor(m: Mat): number {
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  return (sx + sy) / 2;
}

/**
 * Ma trận chỉ gồm xoay + phóng đều (không lật, không méo) — khi đó đường tròn
 * và cung tròn vẫn là đường tròn nên xuất được <circle>/<path> thay vì lấy mẫu.
 */
function isConformal(m: Mat): boolean {
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  if (sx < 1e-12 || sy < 1e-12) return false;
  if (Math.abs(sx - sy) > 1e-6 * Math.max(sx, sy)) return false;
  return m[0] * m[3] - m[1] * m[2] > 0;
}

/** Lấy mẫu cung tròn trong hệ toạ độ gốc (chưa biến đổi). */
function arcSamples(cx: number, cy: number, r: number, startRad: number, spanRad: number): [number, number][] {
  const steps = Math.max(8, Math.round((Math.abs(spanRad) / (2 * Math.PI)) * 64));
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = startRad + (spanRad * i) / steps;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Ma trận đặt block của INSERT: dời về vị trí, xoay, phóng, rồi trừ base point. */
function insertMatrix(ent: any, basePoint: { x?: number; y?: number } | undefined): Mat {
  const px = ent.position?.x ?? 0;
  const py = ent.position?.y ?? 0;
  const sx = ent.xScale ?? ent.scaleX ?? 1;
  const sy = ent.yScale ?? ent.scaleY ?? 1;
  const rot = ((ent.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // translate(px,py) · rotate(rot) · scale(sx,sy) · translate(-bx,-by)
  const rotScale: Mat = [cos * sx, sin * sx, -sin * sy, cos * sy, px, py];
  const bx = basePoint?.x ?? 0;
  const by = basePoint?.y ?? 0;
  return matMul(rotScale, [1, 0, 0, 1, -bx, -by]);
}

/** 4 chữ số thập phân ở đơn vị mét = 0,1 mm — đủ chính xác, giảm mạnh kích thước SVG. */
function n(v: number): string {
  return String(Math.round(v * 1e4) / 1e4);
}

/** Lấy điểm trên B-spline bằng thuật toán de Boor. */
function deBoor(t: number, ctrl: any[], degree: number, knots: number[]): [number, number] {
  let k = degree;
  while (k < ctrl.length - 1 && knots[k + 1] <= t) k++;
  const dx: number[] = [];
  const dy: number[] = [];
  for (let j = 0; j <= degree; j++) {
    const cp = ctrl[j + k - degree] ?? ctrl[ctrl.length - 1];
    dx[j] = cp.x ?? 0;
    dy[j] = cp.y ?? 0;
  }
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const lo = knots[j + k - degree];
      const hi = knots[j + 1 + k - r];
      const denom = hi - lo;
      const a = denom === 0 ? 0 : (t - lo) / denom;
      dx[j] = (1 - a) * dx[j - 1] + a * dx[j];
      dy[j] = (1 - a) * dy[j - 1] + a * dy[j];
    }
  }
  return [dx[degree], dy[degree]];
}

/** SPLINE → chuỗi điểm. Ưu tiên control points + knots, thiếu thì rơi về fit points. */
function splinePoints(ent: any): [number, number][] {
  const ctrl: any[] = ent.controlPoints ?? [];
  const fit: any[] = ent.fitPoints ?? [];
  const knots: number[] = ent.knotValues ?? [];
  const degree: number = ent.degreeOfSplineCurve ?? ent.degree ?? 3;

  if (ctrl.length > degree && knots.length === ctrl.length + degree + 1) {
    const t0 = knots[degree];
    const t1 = knots[ctrl.length];
    if (t1 > t0) {
      const steps = Math.min(200, Math.max(16, (ctrl.length - degree) * 8));
      const out: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const t = t0 + ((t1 - t0) * i) / steps;
        out.push(deBoor(Math.min(t, t1 - 1e-12), ctrl, degree, knots));
      }
      return out;
    }
  }
  const src = fit.length >= 2 ? fit : ctrl;
  return src.map((p: any) => [p.x ?? 0, p.y ?? 0] as [number, number]);
}

/** ELLIPSE → chuỗi điểm lấy mẫu theo tham số. */
function ellipsePoints(ent: any): [number, number][] {
  const cx = ent.center?.x ?? 0;
  const cy = ent.center?.y ?? 0;
  const mx = ent.majorAxisEndPoint?.x ?? 0;
  const my = ent.majorAxisEndPoint?.y ?? 0;
  const ratio = ent.axisRatio ?? ent.axisRatioOfMinorAxisToMajorAxis ?? 1;
  const a = Math.hypot(mx, my);
  const b = a * ratio;
  const tilt = Math.atan2(my, mx);
  let t0 = ent.startAngle ?? 0;
  let t1 = ent.endAngle ?? Math.PI * 2;
  if (t1 <= t0) t1 += Math.PI * 2;
  const steps = Math.max(12, Math.round(((t1 - t0) / (Math.PI * 2)) * 64));
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const ex = a * Math.cos(t);
    const ey = b * Math.sin(t);
    out.push([cx + ex * cosT - ey * sinT, cy + ex * sinT + ey * cosT]);
  }
  return out;
}

/** Số lần đặt block lồng nhau tối đa — chặn block tự tham chiếu vòng. */
const MAX_INSERT_DEPTH = 8;
/** Chặn INSERT dạng lưới (columnCount × rowCount) sinh ra quá nhiều bản sao. */
const MAX_ARRAY_COPIES = 400;

/**
 * Duyệt entity và sinh phần tử SVG.
 * `m` gộp cả unit scale lẫn phép biến đổi của các INSERT bao ngoài, nên toạ độ
 * sinh ra đã ở mét trong hệ toạ độ modelspace.
 */
function renderEntities(
  entities: any[],
  m: Mat,
  blocks: Record<string, any> = {},
  depth = 0,
): RenderResult {
  const elements: string[] = [];
  const points: [number, number][] = [];
  const rings: [number, number][][] = [];
  const conformal = isConformal(m);

  const pushPolyline = (pts: [number, number][], closed: boolean) => {
    if (pts.length < 2) return;
    const tp = pts.map(([x, y]) => matApply(m, x, y));
    for (const p of tp) points.push(p);
    if (closed && tp.length >= 3) rings.push(tp);
    const str = tp.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
    elements.push(closed ? `<polygon points="${str}"/>` : `<polyline points="${str}"/>`);
  };

  for (const ent of entities) {
    if (ent.type === 'LINE') {
      const v0 = ent.vertices?.[0] ?? ent.start ?? { x: 0, y: 0 };
      const v1 = ent.vertices?.[1] ?? ent.end ?? { x: 0, y: 0 };
      const [x1, y1] = matApply(m, v0.x ?? 0, v0.y ?? 0);
      const [x2, y2] = matApply(m, v1.x ?? 0, v1.y ?? 0);
      points.push([x1, y1], [x2, y2]);
      elements.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`);

    } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices?.length) {
      pushPolyline(
        ent.vertices.map((v: any) => [v.x ?? 0, v.y ?? 0] as [number, number]),
        ent.shape === true || ent.closed === true,
      );

    } else if (ent.type === 'SPLINE') {
      pushPolyline(splinePoints(ent), ent.closed === true);

    } else if (ent.type === 'ELLIPSE') {
      pushPolyline(ellipsePoints(ent), false);

    } else if (ent.type === 'CIRCLE') {
      const rawR = ent.radius ?? 0;
      if (conformal) {
        const [cx, cy] = matApply(m, ent.center?.x ?? 0, ent.center?.y ?? 0);
        const r = rawR * matScaleFactor(m);
        points.push([cx - r, cy], [cx + r, cy], [cx, cy - r], [cx, cy + r]);
        // Vẫn ghi ring để footprint có đường bao thật thay vì 4 điểm cardinal.
        rings.push(arcSamples(cx, cy, r, 0, 2 * Math.PI));
        elements.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`);
      } else {
        // Phóng không đều biến đường tròn thành ellipse — phải lấy mẫu.
        pushPolyline(arcSamples(ent.center?.x ?? 0, ent.center?.y ?? 0, rawR, 0, 2 * Math.PI), true);
      }

    } else if (ent.type === 'ARC') {
      const rawCx = ent.center?.x ?? 0;
      const rawCy = ent.center?.y ?? 0;
      const rawR = ent.radius ?? 0;
      const startRad: number = ent.startAngle ?? 0;
      const endRad: number = ent.endAngle ?? 0;
      let arcLenRad: number = ent.angleLength != null
        ? ent.angleLength
        : ((endRad - startRad) + 2 * Math.PI) % (2 * Math.PI);
      if (arcLenRad < 1e-10) arcLenRad = 2 * Math.PI;

      if (conformal) {
        // Xoay + phóng đều giữ nguyên cung tròn: chỉ cần dời tâm và cộng góc xoay.
        const rot = Math.atan2(m[1], m[0]);
        const r = rawR * matScaleFactor(m);
        const a0 = startRad + rot;
        const a1 = a0 + arcLenRad;
        const [cx, cy] = matApply(m, rawCx, rawCy);
        const ax1 = cx + r * Math.cos(a0);
        const ay1 = cy + r * Math.sin(a0);
        const ax2 = cx + r * Math.cos(a1);
        const ay2 = cy + r * Math.sin(a1);
        points.push([ax1, ay1], [ax2, ay2]);
        const startDeg = (a0 * 180) / Math.PI;
        const span = (arcLenRad * 180) / Math.PI;
        for (const deg of [0, 90, 180, 270]) {
          const d = ((deg - startDeg) % 360 + 360) % 360;
          if (d <= span) {
            const rad = (deg * Math.PI) / 180;
            points.push([cx + r * Math.cos(rad), cy + r * Math.sin(rad)]);
          }
        }
        const largeArc = span > 180 ? 1 : 0;
        elements.push(`<path d="M ${n(ax1)} ${n(ay1)} A ${n(r)} ${n(r)} 0 ${largeArc} 1 ${n(ax2)} ${n(ay2)}"/>`);
      } else {
        pushPolyline(arcSamples(rawCx, rawCy, rawR, startRad, arcLenRad), false);
      }

    } else if (ent.type === 'INSERT' && depth < MAX_INSERT_DEPTH) {
      const name: string = ent.name ?? ent.block ?? '';
      const block = blocks[name];
      if (!block?.entities?.length) continue;
      const local = insertMatrix(ent, block.position);

      const cols = Math.max(1, ent.columnCount ?? 1);
      const rows = Math.max(1, ent.rowCount ?? 1);
      const colSp = ent.columnSpacing ?? 0;
      const rowSp = ent.rowSpacing ?? 0;
      let copies = 0;
      for (let c = 0; c < cols && copies < MAX_ARRAY_COPIES; c++) {
        for (let r = 0; r < rows && copies < MAX_ARRAY_COPIES; r++) {
          copies++;
          const offset: Mat = [1, 0, 0, 1, c * colSp, r * rowSp];
          const child = renderEntities(
            block.entities,
            matMul(m, matMul(offset, local)),
            blocks,
            depth + 1,
          );
          elements.push(...child.elements);
          points.push(...child.points);
          rings.push(...child.rings);
        }
      }
    }
  }

  return { elements, points, rings };
}

function bboxFromPoints(points: [number, number][]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (points.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/** Cạnh dài của ảnh nền, tính bằng pixel. */
const RASTER_LONG_SIDE_PX = 2400;

/**
 * Bọc phần tử SVG kèm width/height pixel.
 *
 * Thiếu width/height thì <img> lấy kích thước mặc định 300×150 px: bản vẽ bị
 * rasterize ở độ phân giải đó rồi canvas phóng to lên vài nghìn pixel, nét vẽ
 * mờ tới mức không nhìn thấy và tỉ lệ 300:150 còn làm hình méo.
 */
function wrapSvg(elements: string[], minX: number, maxY: number, w: number, h: number): string {
  const pxW = Math.max(1, Math.round(w >= h ? RASTER_LONG_SIDE_PX : (RASTER_LONG_SIDE_PX * w) / h));
  const pxH = Math.max(1, Math.round(w >= h ? (RASTER_LONG_SIDE_PX * h) / w : RASTER_LONG_SIDE_PX));
  // Nét vẽ ~1,2 px sau khi rasterize.
  const strokeWidth = (Math.max(w, h) / RASTER_LONG_SIDE_PX) * 1.2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="0 0 ${n(w)} ${n(h)}" preserveAspectRatio="none">`,
    `<g transform="translate(${n(-minX)},${n(maxY)}) scale(1,-1)" fill="none" stroke="#334155" stroke-width="${n(strokeWidth)}" stroke-linejoin="round" stroke-linecap="round">`,
    ...elements,
    `</g></svg>`,
  ].join('');
}

function buildSvg(elements: string[], points: [number, number][]): string {
  const bb = bboxFromPoints(points);
  if (!bb) return '';
  const { minX, maxX, minY, maxY } = bb;
  return wrapSvg(elements, minX, maxY, Math.max(maxX - minX, 1e-6), Math.max(maxY - minY, 1e-6));
}

/**
 * DXF text → SVG string (vector, Y-up→Y-down flip, viewBox theo mét).
 * Vẽ LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, SPLINE, ELLIPSE, và mở rộng
 * INSERT thành hình học của block được tham chiếu (đệ quy).
 * unitScale param overrides $INSUNITS; default fallback = mm (0.001).
 */
export function dxfToSvg(dxfText: string, unitScale?: number): DxfSvgResult {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfText);
  if (!dxf) throw new Error('DXF parse failed');

  const insunits = Number(dxf.header?.['$INSUNITS'] ?? 0);
  const scale = unitScale ?? INSUNITS_SCALE[insunits] ?? 0.001;

  const blocks: Record<string, any> = (dxf as any).blocks ?? {};
  const unitMatrix: Mat = [scale, 0, 0, scale, 0, 0];
  const { elements, points: allPoints } = renderEntities(dxf.entities ?? [], unitMatrix, blocks);

  if (allPoints.length === 0) throw new Error('DXF contains no geometry');

  const bb = bboxFromPoints(allPoints)!;
  const { minX, maxX, minY, maxY } = bb;

  const widthM = Math.round((maxX - minX) * 10000) / 10000;
  const heightM = Math.round((maxY - minY) * 10000) / 10000;

  const svg = wrapSvg(elements, minX, maxY, Math.max(widthM, 1e-6), Math.max(heightM, 1e-6));

  // Build cache theo tên block: ảnh preview + kích thước gốc (đơn vị DXF)
  type BlockInfo = { preview: string; wUnits: number; hUnits: number };
  const previewCache = new Map<string, BlockInfo>();
  function getBlockInfo(name: string): BlockInfo {
    const cached = previewCache.get(name);
    if (cached) return cached;
    const block = blocks[name];
    if (!block?.entities) {
      const empty = { preview: '', wUnits: 0, hUnits: 0 };
      previewCache.set(name, empty);
      return empty;
    }
    const { elements: bElems, points: bPts } = renderEntities(block.entities, IDENTITY, blocks);
    const bb = bboxFromPoints(bPts);
    const info: BlockInfo = {
      preview: buildSvg(bElems, bPts),
      wUnits: bb ? bb.maxX - bb.minX : 0,
      hUnits: bb ? bb.maxY - bb.minY : 0,
    };
    previewCache.set(name, info);
    return info;
  }

  // Extract INSERT entities that fall within the layout bounding box (with generous tolerance)
  const inserts: DxfInsertData[] = [];
  const padCm = Math.max(widthM, heightM) * 100 * 0.2;
  for (const e of dxf.entities ?? []) {
    const ent = e as any;
    if (ent.type !== 'INSERT') continue;
    const blockName: string = ent.name ?? ent.block ?? '';
    if (!blockName || blockName === '*Model_Space' || blockName === '*Paper_Space') continue;
    const x_m = (ent.position?.x ?? 0) * scale;
    const y_m = (ent.position?.y ?? 0) * scale;
    const xCm = Math.round((x_m - minX) * 100 * 100) / 100;
    const yCm = Math.round((maxY - y_m) * 100 * 100) / 100;
    if (xCm < -padCm || xCm > widthM * 100 + padCm) continue;
    if (yCm < -padCm || yCm > heightM * 100 + padCm) continue;
    const info = getBlockInfo(blockName);
    // Cùng một block được chèn với tỉ lệ khác nhau thì kích thước thật khác
    // nhau; lấy trị tuyệt đối vì tỉ lệ âm chỉ có nghĩa là lật gương.
    const sx = Math.abs(Number(ent.xScale ?? 1)) || 1;
    const sy = Math.abs(Number(ent.yScale ?? 1)) || 1;
    inserts.push({
      blockName,
      xCm,
      yCm,
      rotationDeg: -(ent.rotation ?? 0),
      svgPreview: info.preview,
      layer: String(ent.layer ?? ''),
      widthCm: Math.round(info.wUnits * sx * scale * 100 * 10) / 10,
      heightCm: Math.round(info.hUnits * sy * scale * 100 * 10) / 10,
    });
  }

  return { svg, widthM, heightM, inserts };
}

export interface DxfGeometry {
  /** Mọi đỉnh đã đưa về mét, đã áp phép biến đổi của INSERT bao ngoài. */
  points: [number, number][];
  /** Các đường bao kín, cùng hệ toạ độ với `points`. */
  closedRings: [number, number][][];
}

/**
 * Trích hình học 2D của DXF, có mở rộng block qua INSERT.
 *
 * Dùng chung cho cả sinh SVG nền lẫn dựng footprint sản phẩm — hai chỗ trước
 * đây duyệt entity riêng và cùng bỏ sót hình học nằm trong block.
 */
export function dxfToGeometry(dxfText: string, unitScale?: number): DxfGeometry {
  const dxf = new DxfParser().parseSync(dxfText);
  if (!dxf) throw new Error('DXF parse failed');

  const insunits = Number(dxf.header?.['$INSUNITS'] ?? 0);
  const scale = unitScale ?? INSUNITS_SCALE[insunits] ?? 0.001;
  const blocks: Record<string, any> = (dxf as any).blocks ?? {};
  const { points, rings } = renderEntities(dxf.entities ?? [], [scale, 0, 0, scale, 0, 0], blocks);
  return { points, closedRings: rings };
}

/** Entity đặc cho khối 3D — dxf-parser không đọc được nên phải dò trên text thô. */
const SOLID_3D_TYPES = /^[ \t]*0[ \t]*\r?\n[ \t]*(3DSOLID|BODY|REGION|MESH|SURFACE|PLANESURFACE|EXTRUDEDSURFACE|REVOLVEDSURFACE|SWEPTSURFACE|LOFTEDSURFACE|NURBSURFACE)[ \t]*\r?$/m;

/**
 * File có chứa khối 3D ACIS hay không.
 *
 * dxf-parser bỏ qua hoàn toàn 3DSOLID (dữ liệu ACIS nhị phân), nên nếu chỉ nhìn
 * `dxf.entities` thì một file 3D thuần trông y hệt file rỗng — và người dùng
 * nhận thông báo "không chứa hình học 2D" thay vì được chỉ sang STP/IFC.
 */
export function dxfHas3dSolid(dxfText: string): boolean {
  return SOLID_3D_TYPES.test(dxfText);
}
