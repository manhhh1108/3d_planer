import DxfParser from 'dxf-parser';

const INSUNITS_SCALE: Record<number, number> = {
  1: 0.0254,
  2: 0.3048,
  4: 0.001,
  5: 0.01,
  6: 1,
};

export interface DxfSvgResult {
  svg: string;
  widthM: number;
  heightM: number;
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

  const allPoints: [number, number][] = [];
  const elements: string[] = [];

  for (const e of dxf.entities ?? []) {
    const ent = e as any;

    if (ent.type === 'LINE') {
      // dxf-parser returns LINE vertices as an array (not start/end properties)
      const v0 = ent.vertices?.[0] ?? ent.start ?? { x: 0, y: 0 };
      const v1 = ent.vertices?.[1] ?? ent.end ?? { x: 0, y: 0 };
      const x1 = (v0.x ?? 0) * scale;
      const y1 = (v0.y ?? 0) * scale;
      const x2 = (v1.x ?? 0) * scale;
      const y2 = (v1.y ?? 0) * scale;
      allPoints.push([x1, y1], [x2, y2]);
      elements.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);

    } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices?.length) {
      const pts: [number, number][] = ent.vertices.map((v: any) => [v.x * scale, v.y * scale]);
      for (const p of pts) allPoints.push(p);
      const pointsStr = pts.map(([x, y]: [number, number]) => `${x},${y}`).join(' ');
      const isClosed = ent.shape === true || ent.closed === true;
      elements.push(isClosed
        ? `<polygon points="${pointsStr}"/>`
        : `<polyline points="${pointsStr}"/>`);

    } else if (ent.type === 'CIRCLE') {
      const cx = (ent.center?.x ?? 0) * scale;
      const cy = (ent.center?.y ?? 0) * scale;
      const r = (ent.radius ?? 0) * scale;
      allPoints.push([cx - r, cy], [cx + r, cy], [cx, cy - r], [cx, cy + r]);
      elements.push(`<circle cx="${cx}" cy="${cy}" r="${r}"/>`);

    } else if (ent.type === 'ARC') {
      const cx = (ent.center?.x ?? 0) * scale;
      const cy = (ent.center?.y ?? 0) * scale;
      const r = (ent.radius ?? 0) * scale;
      // dxf-parser converts DXF degree angles to radians
      const startRad: number = ent.startAngle ?? 0;
      const endRad: number = ent.endAngle ?? 0;
      const startDeg = startRad * 180 / Math.PI;
      const endDeg = endRad * 180 / Math.PI;
      const ax1 = cx + r * Math.cos(startRad);
      const ay1 = cy + r * Math.sin(startRad);
      const ax2 = cx + r * Math.cos(endRad);
      const ay2 = cy + r * Math.sin(endRad);
      allPoints.push([ax1, ay1], [ax2, ay2]);
      // Add cardinal-axis extremes for any quadrant boundary the arc crosses.
      // Use angleLength (radians) when available for correct full-circle handling.
      const arcLenRad: number = ent.angleLength != null
        ? ent.angleLength
        : ((endRad - startRad) + 2 * Math.PI) % (2 * Math.PI);
      const span = arcLenRad * 180 / Math.PI; // degrees
      for (const deg of [0, 90, 180, 270]) {
        const d = ((deg - startDeg) + 360) % 360;
        if (d <= span) {
          const rad = deg * Math.PI / 180;
          allPoints.push([cx + r * Math.cos(rad), cy + r * Math.sin(rad)]);
        }
      }
      const largeArc = span > 180 ? 1 : 0;
      // DXF arcs are CCW; after scale(1,-1) flip, CCW→CW in SVG screen coords → sweep=1
      elements.push(`<path d="M ${ax1} ${ay1} A ${r} ${r} 0 ${largeArc} 1 ${ax2} ${ay2}"/>`);
    }
  }

  if (allPoints.length === 0) throw new Error('DXF contains no geometry');

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of allPoints) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const widthM = Math.round((maxX - minX) * 10000) / 10000;
  const heightM = Math.round((maxY - minY) * 10000) / 10000;
  const strokeWidth = Math.max(widthM, heightM, 0.001) * 0.001;

  // Flip Y axis: SVG Y↓, DXF Y↑.
  // Transform: translate(-minX, maxY) scale(1,-1)
  // A DXF point (minX, maxY) → SVG (0, 0); (maxX, minY) → (widthM, heightM)
  const tx = -minX;
  const ty = maxY;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthM} ${heightM}">`,
    `<g transform="translate(${tx},${ty}) scale(1,-1)" fill="none" stroke="#334155" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round">`,
    ...elements,
    `</g>`,
    `</svg>`,
  ].join('');

  return { svg, widthM, heightM };
}
