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
}

function renderEntities(entities: any[], scale: number): RenderResult {
  const elements: string[] = [];
  const points: [number, number][] = [];

  for (const ent of entities) {
    if (ent.type === 'LINE') {
      const v0 = ent.vertices?.[0] ?? ent.start ?? { x: 0, y: 0 };
      const v1 = ent.vertices?.[1] ?? ent.end ?? { x: 0, y: 0 };
      const x1 = (v0.x ?? 0) * scale;
      const y1 = (v0.y ?? 0) * scale;
      const x2 = (v1.x ?? 0) * scale;
      const y2 = (v1.y ?? 0) * scale;
      points.push([x1, y1], [x2, y2]);
      elements.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);

    } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices?.length) {
      const pts: [number, number][] = ent.vertices.map((v: any) => [v.x * scale, v.y * scale]);
      for (const p of pts) points.push(p);
      const pointsStr = pts.map(([x, y]: [number, number]) => `${x},${y}`).join(' ');
      const isClosed = ent.shape === true || ent.closed === true;
      elements.push(isClosed
        ? `<polygon points="${pointsStr}"/>`
        : `<polyline points="${pointsStr}"/>`);

    } else if (ent.type === 'CIRCLE') {
      const cx = (ent.center?.x ?? 0) * scale;
      const cy = (ent.center?.y ?? 0) * scale;
      const r = (ent.radius ?? 0) * scale;
      points.push([cx - r, cy], [cx + r, cy], [cx, cy - r], [cx, cy + r]);
      elements.push(`<circle cx="${cx}" cy="${cy}" r="${r}"/>`);

    } else if (ent.type === 'ARC') {
      const cx = (ent.center?.x ?? 0) * scale;
      const cy = (ent.center?.y ?? 0) * scale;
      const r = (ent.radius ?? 0) * scale;
      const startRad: number = ent.startAngle ?? 0;
      const endRad: number = ent.endAngle ?? 0;
      const startDeg = startRad * 180 / Math.PI;
      const ax1 = cx + r * Math.cos(startRad);
      const ay1 = cy + r * Math.sin(startRad);
      const ax2 = cx + r * Math.cos(endRad);
      const ay2 = cy + r * Math.sin(endRad);
      points.push([ax1, ay1], [ax2, ay2]);
      let arcLenRad: number = ent.angleLength != null
        ? ent.angleLength
        : ((endRad - startRad) + 2 * Math.PI) % (2 * Math.PI);
      if (arcLenRad < 1e-10) arcLenRad = 2 * Math.PI;
      const span = arcLenRad * 180 / Math.PI;
      for (const deg of [0, 90, 180, 270]) {
        const d = ((deg - startDeg) + 360) % 360;
        if (d <= span) {
          const rad = deg * Math.PI / 180;
          points.push([cx + r * Math.cos(rad), cy + r * Math.sin(rad)]);
        }
      }
      const largeArc = span > 180 ? 1 : 0;
      elements.push(`<path d="M ${ax1} ${ay1} A ${r} ${r} 0 ${largeArc} 1 ${ax2} ${ay2}"/>`);
    }
  }

  return { elements, points };
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

function buildSvg(elements: string[], points: [number, number][]): string {
  const bb = bboxFromPoints(points);
  if (!bb) return '';
  const { minX, maxX, minY, maxY } = bb;
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  const sw = Math.max(w, h) * 0.002;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`,
    `<g transform="translate(${-minX},${maxY}) scale(1,-1)" fill="none" stroke="#334155" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">`,
    ...elements,
    `</g></svg>`,
  ].join('');
}

/**
 * DXF text → SVG string (vector, Y-up→Y-down flip, viewBox in meters).
 * Renders LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC entities as strokes.
 * unitScale param overrides $INSUNITS; default fallback = mm (0.001).
 */
export function dxfToSvg(dxfText: string, unitScale?: number): DxfSvgResult {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfText);
  if (!dxf) throw new Error('DXF parse failed');

  const insunits = Number(dxf.header?.['$INSUNITS'] ?? 0);
  const scale = unitScale ?? INSUNITS_SCALE[insunits] ?? 0.001;

  const { elements, points: allPoints } = renderEntities(dxf.entities ?? [], scale);

  if (allPoints.length === 0) throw new Error('DXF contains no geometry');

  const bb = bboxFromPoints(allPoints)!;
  const { minX, maxX, minY, maxY } = bb;

  const widthM = Math.round((maxX - minX) * 10000) / 10000;
  const heightM = Math.round((maxY - minY) * 10000) / 10000;
  const strokeWidth = Math.max(widthM, heightM, 0.001) * 0.001;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthM} ${heightM}">`,
    `<g transform="translate(${-minX},${maxY}) scale(1,-1)" fill="none" stroke="#334155" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round">`,
    ...elements,
    `</g></svg>`,
  ].join('');

  // Build SVG preview cache: unique block name → svg string
  const blocks = (dxf as any).blocks ?? {};
  const previewCache = new Map<string, string>();
  function getPreview(name: string): string {
    if (previewCache.has(name)) return previewCache.get(name)!;
    const block = blocks[name];
    if (!block?.entities) { previewCache.set(name, ''); return ''; }
    const { elements: bElems, points: bPts } = renderEntities(block.entities, scale);
    const preview = buildSvg(bElems, bPts);
    previewCache.set(name, preview);
    return preview;
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
    inserts.push({
      blockName,
      xCm,
      yCm,
      rotationDeg: -(ent.rotation ?? 0),
      svgPreview: getPreview(blockName),
    });
  }

  return { svg, widthM, heightM, inserts };
}
