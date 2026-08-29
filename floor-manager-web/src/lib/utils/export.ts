import type { Project, Floor } from '$lib/models/types';
import { getCatalogItem } from '$lib/utils/furnitureCatalog';
import { floorPlanBounds, planHasContent, drawWallsToCanvas, wallsToSvg } from '$lib/utils/planRender';
import type { CanvasState } from '$lib/utils/canvasInteraction';

/** Escape text for safe SVG embedding */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Trần kích thước canvas an toàn cho mọi trình duyệt.
 *
 * Vượt trần thì canvas không ném lỗi ngay: nó lặng lẽ hỏng, toDataURL() trả về
 * chuỗi rỗng "data:," và mãi tới lúc jsPDF giải mã mới báo "wrong PNG
 * signature" — nhìn vào không đoán ra là do bản vẽ quá to. Bản vẽ tính bằng cm
 * nên một nhà xưởng 100m đã là 10000 đơn vị, nhân đôi là vượt trần ngay.
 */
const MAX_CANVAS_SIDE = 8192;
const MAX_CANVAS_AREA = 40_000_000;

/** Hệ số phóng to lớn nhất còn giữ canvas trong giới hạn cạnh lẫn diện tích */
function fitCanvasScale(w: number, h: number, desired = 2): number {
  if (w <= 0 || h <= 0) return desired;
  const bySide = Math.min(MAX_CANVAS_SIDE / w, MAX_CANVAS_SIDE / h);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (w * h));
  return Math.max(0.05, Math.min(desired, bySide, byArea));
}

/**
 * Quy kích thước canvas về số nguyên.
 *
 * Làm tròn lên ở đúng ngưỡng sẽ vượt trần thêm vài trăm nghìn điểm ảnh, nên
 * cắt xuống — thà thiếu một dòng điểm ảnh còn hơn hỏng cả tấm ảnh.
 */
function canvasPx(v: number): number {
  return Math.max(1, Math.floor(v));
}

/** Bỏ ký tự không hợp lệ trong tên tệp, tránh trình duyệt chặn tải */
function safeFileName(name: string): string {
  return (name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'floorplan').slice(0, 80);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export the full floor plan as a high-resolution PNG.
 * Renders furniture onto an offscreen canvas so the export isn't limited to the current viewport.
 */
export function exportAsPNG(canvas: HTMLCanvasElement, project?: Project) {
  const name = project?.name || 'floorplan';

  if (project) {
    const floor = project.floors.find(f => f.id === project.activeFloorId) ?? project.floors[0];
    const bounds = planHasContent(floor) ? floorPlanBounds(floor) : null;
    if (floor && bounds) {
      const { minX, minY, maxX, maxY } = bounds;
      const pad = 80;
      const w = maxX - minX + pad * 2;
      const h = maxY - minY + pad * 2;
      // Gấp đôi cho nét, nhưng hạ xuống nếu bản vẽ to quá trần canvas
      const scale = fitCanvasScale(w, h);
      const offscreen = document.createElement('canvas');
      offscreen.width = canvasPx(w * scale);
      offscreen.height = canvasPx(h * scale);
      const ctx = offscreen.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, w, h);

      // Tường vẽ trước để block nằm đè lên, giống thứ tự trên màn hình
      drawWallsToCanvas(ctx, floor.walls, { x: -minX + pad, y: -minY + pad }, 0.5);

      // Draw furniture
      for (const fi of floor.furniture) {
        const fx = fi.position.x - minX + pad;
        const fy = fi.position.y - minY + pad;
        const cat = getCatalogItem(fi.catalogId);
        const fw = fi.width ?? (cat ? cat.width : 30);
        const fd = fi.depth ?? (cat ? cat.depth : 30);
        const color = fi.color ?? (cat ? cat.color : '#a0c4e8');
        const rot = (fi.rotation || 0) * Math.PI / 180;
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(rot);
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = color;
        ctx.fillRect(-fw / 2, -fd / 2, fw, fd);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-fw / 2, -fd / 2, fw, fd);
        ctx.globalAlpha = 1;
        if (cat) {
          ctx.fillStyle = '#333';
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(cat.name, 0, 4);
        }
        ctx.restore();
      }

      // Title
      ctx.fillStyle = '#222';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${name} — ${floor.name}`, 20, 24);

      offscreen.toBlob((blob) => {
        if (blob) download(blob, `${safeFileName(name)}.png`);
        else console.error('[export] Không dựng được ảnh PNG — bản vẽ quá lớn so với giới hạn canvas');
      });
      return;
    }
  }

  // Fallback: just capture the viewport canvas
  canvas.toBlob((blob) => {
    if (blob) download(blob, `${safeFileName(name)}-2d.png`);
  });
}

export function exportAsJSON(project: Project) {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  download(blob, `${safeFileName(project.name || 'project')}.json`);
}

export function exportAsSVG(project: Project) {
  const floor = project.floors.find(f => f.id === project.activeFloorId) ?? project.floors[0];
  if (!planHasContent(floor)) return;
  const bounds = floorPlanBounds(floor);
  if (!floor || !bounds) return;
  const { minX, minY, maxX, maxY } = bounds;
  const pad = 50;
  const vw = maxX - minX + pad * 2;
  const vh = maxY - minY + pad * 2;

  // Tường vẽ trước để block nằm đè lên
  let paths = wallsToSvg(floor.walls, { x: -minX + pad, y: -minY + pad });

  // Furniture rectangles (actual dimensions from catalog)
  for (const fi of floor.furniture) {
    const fx = fi.position.x - minX + pad;
    const fy = fi.position.y - minY + pad;
    const cat = getCatalogItem(fi.catalogId);
    const fw = fi.width ?? (cat ? cat.width : 30);
    const fd = fi.depth ?? (cat ? cat.depth : 30);
    const color = fi.color ?? (cat ? cat.color : '#a0c4e8');
    const rot = fi.rotation || 0;
    paths += `  <g transform="translate(${fx},${fy}) rotate(${rot})">\n`;
    paths += `    <rect x="${-fw / 2}" y="${-fd / 2}" width="${fw}" height="${fd}" fill="${color}" stroke="#555" stroke-width="0.5" rx="2" opacity="0.7"/>\n`;
    if (cat) {
      paths += `    <text x="0" y="4" text-anchor="middle" font-size="9" fill="#333" font-family="sans-serif">${escapeXml(cat.name)}</text>\n`;
    }
    paths += `  </g>\n`;
  }

  // Measurements
  if (floor.measurements) {
    for (const m of floor.measurements) {
      const x1 = m.x1 - minX + pad, y1 = m.y1 - minY + pad;
      const x2 = m.x2 - minX + pad, y2 = m.y2 - minY + pad;
      paths += `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ef4444" stroke-width="1" stroke-dasharray="6,3" stroke-linecap="round"/>\n`;
      const dist = Math.round(Math.hypot(m.x2 - m.x1, m.y2 - m.y1));
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      paths += `  <text x="${mx}" y="${my - 6}" text-anchor="middle" font-size="10" fill="#ef4444" font-family="sans-serif" font-weight="bold">${dist} cm</text>\n`;
    }
  }

  // Annotations (dimension callouts)
  if (floor.annotations) {
    for (const a of floor.annotations) {
      const ax1 = a.x1 - minX + pad, ay1 = a.y1 - minY + pad;
      const ax2 = a.x2 - minX + pad, ay2 = a.y2 - minY + pad;
      const dx = ax2 - ax1, dy = ay2 - ay1;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux;
      const offset = a.offset || 40;
      const d1x = ax1 + nx * offset, d1y = ay1 + ny * offset;
      const d2x = ax2 + nx * offset, d2y = ay2 + ny * offset;
      // Leader lines
      paths += `  <line x1="${ax1}" y1="${ay1}" x2="${d1x}" y2="${d1y}" stroke="#6366f1" stroke-width="0.75"/>\n`;
      paths += `  <line x1="${ax2}" y1="${ay2}" x2="${d2x}" y2="${d2y}" stroke="#6366f1" stroke-width="0.75"/>\n`;
      // Dimension line
      paths += `  <line x1="${d1x}" y1="${d1y}" x2="${d2x}" y2="${d2y}" stroke="#6366f1" stroke-width="1"/>\n`;
      // Arrowheads
      const arrowLen = 7, arrowW = 3;
      for (const [px, py, dir] of [[d1x, d1y, 1], [d2x, d2y, -1]] as [number, number, number][]) {
        const adx = ux * arrowLen * dir, ady = uy * arrowLen * dir;
        const apx = -uy * arrowW, apy = ux * arrowW;
        paths += `  <polygon points="${px},${py} ${px + adx + apx},${py + ady + apy} ${px + adx - apx},${py + ady - apy}" fill="#6366f1"/>\n`;
      }
      // Label
      const dist = Math.round(Math.hypot(a.x2 - a.x1, a.y2 - a.y1));
      const label = a.label || `${dist} cm`;
      const mx = (d1x + d2x) / 2, my = (d1y + d2y) / 2;
      paths += `  <text x="${mx}" y="${my - 4}" text-anchor="middle" font-size="10" fill="#6366f1" font-family="sans-serif">${escapeXml(label)}</text>\n`;
    }
  }

  // Text annotations
  if (floor.textAnnotations) {
    for (const ta of floor.textAnnotations) {
      const tx = ta.x - minX + pad;
      const ty = ta.y - minY + pad;
      const transform = ta.rotation ? ` transform="rotate(${ta.rotation} ${tx} ${ty})"` : '';
      paths += `  <text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" font-size="${ta.fontSize}" fill="${escapeXml(ta.color)}" font-family="sans-serif"${transform}>${escapeXml(ta.text)}</text>\n`;
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">
  <rect width="100%" height="100%" fill="white"/>
${paths}</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  download(blob, `${safeFileName(project.name || 'floorplan')}.svg`);
}

export function exportAs3DPNG(renderer: { domElement: HTMLCanvasElement }) {
  renderer.domElement.toBlob((blob: Blob | null) => {
    if (blob) download(blob, 'floorplan-3d.png');
  });
}
