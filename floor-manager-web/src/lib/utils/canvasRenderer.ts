/**
 * Canvas rendering functions for the floor plan editor.
 * All functions are pure — they take canvas context + data and render.
 * Extracted from FloorPlanCanvas.svelte.
 */
import type { Point, FurnitureItem, Floor, Annotation } from '$lib/models/types';
import type { CanvasState } from '$lib/utils/canvasInteraction';
import type { ProjectSettings } from '$lib/stores/settings';
import { formatLength } from '$lib/stores/settings';
import { getCatalogItem } from '$lib/utils/furnitureCatalog';
import { drawFurnitureIcon } from '$lib/utils/furnitureIcons';

// ── Coordinate conversion (local helpers using CanvasState) ─────────

function wts(cs: CanvasState, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cs.camX) * cs.zoom + cs.width / 2, y: (wy - cs.camY) * cs.zoom + cs.height / 2 };
}

// ── Grid ─────────────────────────────────────────────────────────────

export function drawGrid(
  cs: CanvasState,
  showGrid: boolean,
  snapToGrid: boolean,
  gridSize: number,
): void {
  if (!cs.ctx || !showGrid) return;
  const { ctx, width, height, zoom, camX, camY } = cs;
  const GRID = 20;
  const step = (snapToGrid ? gridSize : GRID) * zoom;
  if (step < 4) return;

  ctx.strokeStyle = '#e8eaed';
  ctx.lineWidth = 0.5;
  const offX = (width / 2 - camX * zoom) % step;
  const offY = (height / 2 - camY * zoom) % step;
  for (let x = offX; x < width; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = offY; y < height; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  const majorStep = 100 * zoom;
  if (majorStep >= 20) {
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 0.8;
    const mOffX = (width / 2 - camX * zoom) % majorStep;
    const mOffY = (height / 2 - camY * zoom) % majorStep;
    for (let x = mOffX; x < width; x += majorStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = mOffY; y < height; y += majorStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
  }
}
// ── Furniture drawing ────────────────────────────────────────────────

export function drawFurnitureItem(cs: CanvasState, item: FurnitureItem, selected: boolean): void {
  const { ctx, zoom } = cs;
  const cat = getCatalogItem(item.catalogId);
  if (!cat) return;
  const s = wts(cs, item.position.x, item.position.y);
  const sx = item.scale?.x ?? 1;
  const sy = item.scale?.y ?? 1;
  const w = (item.width ?? cat.width) * Math.abs(sx) * zoom;
  const d = (item.depth ?? cat.depth) * Math.abs(sy) * zoom;
  const angle = (item.rotation * Math.PI) / 180;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angle);
  ctx.scale(Math.sign(sx) || 1, Math.sign(sy) || 1);

  const itemColor = item.color ?? cat.color;
  const strokeColor = selected ? '#3b82f6' : itemColor;
  ctx.lineWidth = selected ? 2 : 1;
  if (cat.footprint && cat.footprint.length > 0) {
    ctx.beginPath();
    for (const ring of cat.footprint) {
      ring.forEach(([fx, fy], i) => {
        const px = fx * zoom;
        const py = -fy * zoom; // y canvas hướng xuống
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
    ctx.fillStyle = itemColor;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
  } else {
    drawFurnitureIcon(ctx, item.catalogId, w, d, itemColor, strokeColor);
  }

  const fontSize = Math.max(8, Math.min(12, Math.min(w, d) * 0.2));
  if (Math.min(w, d) > 20) {
    ctx.fillStyle = '#374151';
    ctx.font = `${fontSize * 0.7}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cat.name, 0, d / 2 + fontSize * 0.8);
  }

  if (selected) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-w / 2 - 2, -d / 2 - 2, w + 4, d + 4);
    ctx.setLineDash([]);

    const hs = 5;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    // Corner handles
    for (const [hx, hy] of [[-w/2, -d/2], [w/2, -d/2], [-w/2, d/2], [w/2, d/2]]) {
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
      ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
    }

    // Edge midpoint handles
    const ehs = 4; // slightly smaller
    for (const [hx, hy] of [[0, -d/2], [0, d/2], [-w/2, 0], [w/2, 0]]) {
      ctx.fillRect(hx - ehs, hy - ehs, ehs * 2, ehs * 2);
      ctx.strokeRect(hx - ehs, hy - ehs, ehs * 2, ehs * 2);
    }

    const rotY = -d / 2 - 18;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -d / 2 - 2);
    ctx.lineTo(0, rotY + 5);
    ctx.stroke();
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(0, rotY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, rotY, 3, -Math.PI * 0.8, Math.PI * 0.4);
    ctx.stroke();
    const arrowAngle2 = Math.PI * 0.4;
    const ax = Math.cos(arrowAngle2) * 3;
    const ay = Math.sin(arrowAngle2) * 3;
    ctx.beginPath();
    ctx.moveTo(ax + 1.5, rotY + ay - 1);
    ctx.lineTo(ax, rotY + ay);
    ctx.lineTo(ax - 1, rotY + ay - 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Guide lines ──────────────────────────────────────────────────────

export function drawGuides(cs: CanvasState, floor: Floor, selectedGuideId: string | null, RULER_SIZE: number): void {
  if (!cs.ctx) return;
  const { ctx, width, height } = cs;
  const guides = floor.guides ?? [];
  const R = RULER_SIZE;
  for (const g of guides) {
    const selected = g.id === selectedGuideId;
    const color = g.orientation === 'horizontal' ? '#00bcd4' : '#e040fb';
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = selected ? 1.5 : 1;
    ctx.setLineDash([6, 4]); ctx.globalAlpha = selected ? 1.0 : 0.7;
    ctx.beginPath();
    if (g.orientation === 'horizontal') {
      const sy = wts(cs, 0, g.position).y;
      ctx.moveTo(R, sy); ctx.lineTo(width, sy);
    } else {
      const sx = wts(cs, g.position, 0).x;
      ctx.moveTo(sx, R); ctx.lineTo(sx, height);
    }
    ctx.stroke(); ctx.setLineDash([]);

    ctx.font = '10px sans-serif'; ctx.fillStyle = color; ctx.globalAlpha = 1;
    const label = formatLength(g.position, 'metric');
    if (g.orientation === 'horizontal') {
      const sy = wts(cs, 0, g.position).y;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(label, R + 4, sy - 2);
    } else {
      const sx = wts(cs, g.position, 0).x;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(label, sx + 4, R + 2);
    }
    ctx.restore();
  }
}

// ── Persisted measurements ───────────────────────────────────────────

export function drawPersistedMeasurements(cs: CanvasState, floor: Floor, selectedMeasurementId: string | null, dimSettings: ProjectSettings): void {
  if (!floor.measurements) return;
  const { ctx } = cs;
  for (const m of floor.measurements) {
    const s = wts(cs, m.x1, m.y1);
    const e = wts(cs, m.x2, m.y2);
    const selected = m.id === selectedMeasurementId;
    ctx.strokeStyle = selected ? '#3b82f6' : '#ef4444';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    ctx.setLineDash([]);

    for (const p of [s, e]) {
      ctx.fillStyle = selected ? '#3b82f6' : '#ef4444';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }

    const dist = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
    const mx = (s.x + e.x) / 2;
    const my = (s.y + e.y) / 2;
    ctx.fillStyle = selected ? '#3b82f6' : '#ef4444';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(formatLength(dist, dimSettings.units), mx, my - 6);
  }
}

// ── Text annotations ─────────────────────────────────────────────────

export function drawTextAnnotations(cs: CanvasState, floor: Floor, selectedTextAnnotationId: string | null, currentSelectedId: string | null): void {
  if (!floor.textAnnotations) return;
  const { ctx, zoom } = cs;
  for (const ta of floor.textAnnotations) {
    const selected = ta.id === selectedTextAnnotationId || ta.id === currentSelectedId;
    const s = wts(cs, ta.x, ta.y);
    const fontSize = Math.max(8, ta.fontSize * zoom);
    ctx.save();
    ctx.translate(s.x, s.y);
    if (ta.rotation) ctx.rotate(ta.rotation * Math.PI / 180);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = ta.color || '#1e293b';
    const lines = ta.text.split('\n');
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 0, -totalHeight / 2 + lineHeight / 2 + i * lineHeight);
    }
    if (selected) {
      let maxW = 0;
      for (const line of lines) { const w = ctx.measureText(line).width; if (w > maxW) maxW = w; }
      const pad = 4;
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.strokeRect(-maxW / 2 - pad, -totalHeight / 2 - pad, maxW + pad * 2, totalHeight + pad * 2);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

// ── Dimension annotations ────────────────────────────────────────────

export function drawAnnotation(cs: CanvasState, a: Annotation, selected: boolean, dimSettings: ProjectSettings): void {
  const { ctx, zoom } = cs;
  const offset = a.offset || 40;
  const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;

  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;

  const d1x = a.x1 + nx * offset, d1y = a.y1 + ny * offset;
  const d2x = a.x2 + nx * offset, d2y = a.y2 + ny * offset;

  const s1 = wts(cs, a.x1, a.y1);
  const s2 = wts(cs, a.x2, a.y2);
  const sd1 = wts(cs, d1x, d1y);
  const sd2 = wts(cs, d2x, d2y);

  const color = selected ? '#3b82f6' : '#6366f1';

  ctx.strokeStyle = color; ctx.lineWidth = 0.75;
  const extBeyond = 4 * zoom;
  ctx.beginPath();
  ctx.moveTo(s1.x, s1.y); ctx.lineTo(sd1.x + nx * extBeyond * zoom, sd1.y + ny * extBeyond * zoom);
  ctx.moveTo(s2.x, s2.y); ctx.lineTo(sd2.x + nx * extBeyond * zoom, sd2.y + ny * extBeyond * zoom);
  ctx.stroke();

  const dimMx = (sd1.x + sd2.x) / 2;
  const dimMy = (sd1.y + sd2.y) / 2;

  const dist = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
  const label = a.label || formatLength(dist, dimSettings.units);
  const fontSize = Math.max(10, 11 * zoom);
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const textW = ctx.measureText(label).width;
  const halfGap = textW / 2 + 4;

  ctx.strokeStyle = color; ctx.lineWidth = selected ? 1.5 : 1;
  const sux = (sd2.x - sd1.x) / Math.hypot(sd2.x - sd1.x, sd2.y - sd1.y) || 0;
  const suy = (sd2.y - sd1.y) / Math.hypot(sd2.x - sd1.x, sd2.y - sd1.y) || 0;
  ctx.beginPath();
  ctx.moveTo(sd1.x, sd1.y); ctx.lineTo(dimMx - sux * halfGap, dimMy - suy * halfGap);
  ctx.moveTo(dimMx + sux * halfGap, dimMy + suy * halfGap); ctx.lineTo(sd2.x, sd2.y);
  ctx.stroke();

  const arrowLen = Math.max(6, 7 * zoom);
  const arrowW = Math.max(2.5, 3 * zoom);
  ctx.fillStyle = color;
  for (const [px, py, dir] of [[sd1.x, sd1.y, 1], [sd2.x, sd2.y, -1]] as [number, number, number][]) {
    const adx = sux * arrowLen * dir;
    const ady = suy * arrowLen * dir;
    const apx = -suy * arrowW;
    const apy = sux * arrowW;
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.lineTo(px + adx + apx, py + ady + apy);
    ctx.lineTo(px + adx - apx, py + ady - apy);
    ctx.closePath(); ctx.fill();
  }

  ctx.fillStyle = color;
  ctx.fillText(label, dimMx, dimMy);

  if (selected) {
    for (const p of [s1, s2]) {
      ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export function drawAnnotations(cs: CanvasState, floor: Floor, selectedAnnotationId: string | null, dimSettings: ProjectSettings): void {
  if (!floor.annotations) return;
  for (const a of floor.annotations) {
    drawAnnotation(cs, a, a.id === selectedAnnotationId, dimSettings);
  }
}

// ── Minimap ──────────────────────────────────────────────────────────

export function drawMinimap(
  cs: CanvasState,
  minimapCanvas: HTMLCanvasElement,
  floor: Floor,
  getWorldBBox: () => { minX: number; minY: number; maxX: number; maxY: number } | null,
): void {
  const mctx = minimapCanvas.getContext('2d');
  if (!mctx) return;
  const mw = minimapCanvas.width;
  const mh = minimapCanvas.height;
  mctx.clearRect(0, 0, mw, mh);

  const bbox = getWorldBBox();
  if (!bbox) return;

  mctx.fillStyle = '#f0f1f3'; mctx.fillRect(0, 0, mw, mh);

  const bw = bbox.maxX - bbox.minX;
  const bh = bbox.maxY - bbox.minY;
  if (bw < 1 || bh < 1) return;
  const scale = Math.min((mw - 8) / bw, (mh - 8) / bh);
  const ox = (mw - bw * scale) / 2;
  const oy = (mh - bh * scale) / 2;

  function toMini(wx: number, wy: number) {
    return { x: ox + (wx - bbox!.minX) * scale, y: oy + (wy - bbox!.minY) * scale };
  }

  mctx.strokeStyle = '#555';
  mctx.lineWidth = Math.max(1, 2 * scale);
  for (const w of floor.walls) {
    const s = toMini(w.start.x, w.start.y);
    const e = toMini(w.end.x, w.end.y);
    mctx.beginPath();
    if (w.curvePoint) {
      const cp = toMini(w.curvePoint.x, w.curvePoint.y);
      mctx.moveTo(s.x, s.y); mctx.quadraticCurveTo(cp.x, cp.y, e.x, e.y);
    } else {
      mctx.moveTo(s.x, s.y); mctx.lineTo(e.x, e.y);
    }
    mctx.stroke();
  }

  for (const fi of floor.furniture) {
    const cat = getCatalogItem(fi.catalogId);
    if (!cat) continue;
    const p = toMini(fi.position.x, fi.position.y);
    const fw = Math.max(2, (fi.width ?? cat.width) * scale);
    const fd = Math.max(2, (fi.depth ?? cat.depth) * scale);
    mctx.fillStyle = (fi.color ?? cat.color) + 'aa';
    mctx.save();
    mctx.translate(p.x, p.y);
    mctx.rotate((fi.rotation * Math.PI) / 180);
    mctx.fillRect(-fw / 2, -fd / 2, fw, fd);
    mctx.restore();
  }

  const { width, height, zoom, camX, camY } = cs;
  const vpTL = { x: (0 - width / 2) / zoom + camX, y: (0 - height / 2) / zoom + camY };
  const vpBR = { x: (width - width / 2) / zoom + camX, y: (height - height / 2) / zoom + camY };
  const vtl = toMini(vpTL.x, vpTL.y);
  const vbr = toMini(vpBR.x, vpBR.y);
  mctx.strokeStyle = '#3b82f6'; mctx.lineWidth = 1.5;
  mctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
  const vw = vbr.x - vtl.x;
  const vh = vbr.y - vtl.y;
  mctx.fillRect(vtl.x, vtl.y, vw, vh);
  mctx.strokeRect(vtl.x, vtl.y, vw, vh);

  mctx.strokeStyle = '#cbd5e1'; mctx.lineWidth = 1; mctx.strokeRect(0, 0, mw, mh);
}

