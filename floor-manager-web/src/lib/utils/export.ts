import type { Project, Floor } from '$lib/models/types';
import { getCatalogItem } from '$lib/utils/furnitureCatalog';
import { floorPlanBounds, planHasContent, drawWallsToCanvas, wallsToSvg } from '$lib/utils/planRender';
import type { CanvasState } from '$lib/utils/canvasInteraction';
import { projectSettings } from '$lib/stores/settings';
import { get } from 'svelte/store';
import jsPDF from 'jspdf';
import { registerFont, FONT_NAME } from '$lib/utils/pdfUtils';

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
      offscreen.width = Math.round(w * scale);
      offscreen.height = Math.round(h * scale);
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
        if (blob) download(blob, `${name}.png`);
        else console.error('[export] Không dựng được ảnh PNG — bản vẽ quá lớn so với giới hạn canvas');
      });
      return;
    }
  }

  // Fallback: just capture the viewport canvas
  canvas.toBlob((blob) => {
    if (blob) download(blob, `${name}-2d.png`);
  });
}

export function exportAsJSON(project: Project) {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  download(blob, `${project.name || 'project'}.json`);
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
  download(blob, `${project.name || 'floorplan'}.svg`);
}

export function exportAs3DPNG(renderer: { domElement: HTMLCanvasElement }) {
  renderer.domElement.toBlob((blob: Blob | null) => {
    if (blob) download(blob, 'floorplan-3d.png');
  });
}

/**
 * Xuất bản vẽ ra PDF.
 *
 * Bất đồng bộ vì phải nạp NotoSans trước khi vẽ chữ — font mặc định của jsPDF
 * dùng bảng mã WinAnsi, không có dấu tiếng Việt nên tên dự án, tên tầng và
 * mô tả đều hỏng chữ.
 */
export async function exportPDF(project: Project) {
  const floor = project.floors.find(f => f.id === project.activeFloorId) ?? project.floors[0];
  if (!floor) return;

  const settings = get(projectSettings);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  await registerFont(pdf);
  const pw = pdf.internal.pageSize.getWidth();   // ~297
  const ph = pdf.internal.pageSize.getHeight();   // ~210
  const margin = 10;
  const titleBlockH = 22;

  // ── helpers ──
  function drawPageBorder() {
    pdf.setDrawColor(40);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, margin, pw - margin * 2, ph - margin * 2);
    // inner border
    pdf.setLineWidth(0.15);
    pdf.rect(margin + 1, margin + 1, pw - margin * 2 - 2, ph - margin * 2 - 2);
  }

  function drawTitleBlock() {
    const tbY = ph - margin - titleBlockH;
    const tbW = pw - margin * 2;
    pdf.setDrawColor(40);
    pdf.setLineWidth(0.4);
    pdf.rect(margin, tbY, tbW, titleBlockH);
    // vertical dividers
    const col1 = margin + tbW * 0.45;
    const col2 = margin + tbW * 0.7;
    pdf.line(col1, tbY, col1, tbY + titleBlockH);
    pdf.line(col2, tbY, col2, tbY + titleBlockH);

    // Project name
    pdf.setFontSize(12);
    pdf.setFont(FONT_NAME, 'bold');
    pdf.text(project.name || 'Untitled Project', margin + 4, tbY + 9);
    pdf.setFontSize(8);
    pdf.setFont(FONT_NAME, 'normal');
    pdf.text(floor.name, margin + 4, tbY + 15);
    if (project.description) {
      pdf.setFontSize(7);
      pdf.text(project.description.substring(0, 60), margin + 4, tbY + 19);
    }

    // Date / scale
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    pdf.setFontSize(8);
    pdf.text(`Date: ${today}`, col1 + 4, tbY + 9);
    pdf.text(`Units: ${settings.units}`, col1 + 4, tbY + 15);

    // Branding
    pdf.setFontSize(9);
    pdf.setFont(FONT_NAME, 'bold');
    pdf.text('openplan3d.com', col2 + 4, tbY + 9);
    pdf.setFont(FONT_NAME, 'normal');
    pdf.setFontSize(7);
    pdf.text('Created with Open 3D Floor Planner', col2 + 4, tbY + 15);
  }

  // ── Page 1: Floor Plan ──
  drawPageBorder();

  // Render floor plan onto an offscreen canvas then embed as image
  const bounds = planHasContent(floor) ? floorPlanBounds(floor) : null;
  const { minX, minY, maxX, maxY } = bounds ?? { minX: Infinity, minY: 0, maxX: 0, maxY: 0 };

  if (!bounds) {
    // No geometry to render
    drawTitleBlock();
    pdf.save(`${project.name || 'floorplan'}.pdf`);
    return;
  }

  const pad = 80;
  const planW = maxX - minX + pad * 2;
  const planH = maxY - minY + pad * 2;
  const scale = fitCanvasScale(planW, planH);
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.round(planW * scale);
  offscreen.height = Math.round(planH * scale);
  const ctx = offscreen.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, planW, planH);

  // Tường vẽ trước để block nằm đè lên
  drawWallsToCanvas(ctx, floor.walls, { x: -minX + pad, y: -minY + pad }, 0.5);

  // Furniture
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

  // Embed rendered plan into PDF
  const imgData = offscreen.toDataURL('image/png');
  // Canvas hỏng trả về "data:," — chặn ở đây thay vì để jsPDF báo "wrong PNG signature"
  if (!imgData.startsWith('data:image/png')) {
    throw new Error('Không dựng được ảnh bản vẽ (bản vẽ quá lớn so với giới hạn canvas của trình duyệt)');
  }
  const drawAreaW = pw - margin * 2 - 4;
  const drawAreaH = ph - margin * 2 - titleBlockH - 6;
  const aspect = planW / planH;
  let imgW = drawAreaW;
  let imgH = drawAreaW / aspect;
  if (imgH > drawAreaH) { imgH = drawAreaH; imgW = drawAreaH * aspect; }
  const imgX = margin + 2 + (drawAreaW - imgW) / 2;
  const imgY = margin + 2 + (drawAreaH - imgH) / 2;
  pdf.addImage(imgData, 'PNG', imgX, imgY, imgW, imgH);

  drawTitleBlock();

  // ── Page 2: 3D View (if a 3D canvas exists) ──
  const canvases = document.querySelectorAll('canvas');
  // Look for a WebGL canvas (the 3D renderer) — typically the second canvas or one with a webgl context
  let threeDCanvas: HTMLCanvasElement | null = null;
  canvases.forEach(c => {
    try {
      if (c.getContext('webgl2') || c.getContext('webgl')) {
        threeDCanvas = c;
      }
    } catch { /* ignore */ }
  });
  // Alternative: grab data attribute or just use last canvas if multiple
  if (!threeDCanvas && canvases.length > 1) {
    threeDCanvas = canvases[canvases.length - 1];
  }

  if (threeDCanvas && (threeDCanvas as HTMLCanvasElement).width > 10 && (threeDCanvas as HTMLCanvasElement).height > 10) {
    try {
      const img3d = (threeDCanvas as HTMLCanvasElement).toDataURL('image/png');
      if (img3d && img3d.length > 100) {
        pdf.addPage('a4', 'landscape');
        drawPageBorder();

        pdf.setFontSize(14);
        pdf.setFont(FONT_NAME, 'bold');
        pdf.setTextColor(40);
        pdf.text('3D Perspective View', margin + 6, margin + 12);

        const da3W = pw - margin * 2 - 4;
        const da3H = ph - margin * 2 - titleBlockH - 20;
        const a3 = (threeDCanvas as HTMLCanvasElement).width / (threeDCanvas as HTMLCanvasElement).height;
        let w3 = da3W;
        let h3 = da3W / a3;
        if (h3 > da3H) { h3 = da3H; w3 = da3H * a3; }
        const x3 = margin + 2 + (da3W - w3) / 2;
        const y3 = margin + 18 + (da3H - h3) / 2;
        pdf.addImage(img3d, 'PNG', x3, y3, w3, h3);

        drawTitleBlock();
      }
    } catch { /* 3D canvas tainted or unavailable — skip */ }
  }

  pdf.save(`${project.name || 'floorplan'}.pdf`);
}
