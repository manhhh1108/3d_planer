/**
 * Zone rendering for the floor plan editor.
 * Pure draw function — takes canvas state + data and renders working zones.
 */
import type { CanvasState } from './canvasInteraction';
import { worldToScreen } from './canvasInteraction';
import type { Floor, Point } from '$lib/models/types';
import type { ApiStage } from '$lib/services/api';
import { polygonCentroid } from './zoneGeometry';

/** Vẽ tất cả vùng + đa giác đang vẽ dở. Vùng nằm dưới sản phẩm. */
export function drawZones(
  cs: CanvasState,
  floor: Floor,
  selectedZoneId: string | null,
  stages: ApiStage[],
  drawingPoints: Point[] | null,
  mouse: Point | null,
): void {
  const { ctx } = cs;
  const stageColor = (id: string) => stages.find((s) => s.id === id)?.color;

  for (const z of floor.zones ?? []) {
    if (z.points.length < 3) continue;
    const selected = z.id === selectedZoneId;
    ctx.beginPath();
    z.points.forEach((p, i) => {
      const s = worldToScreen(cs, p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    const firstColor = z.allowedStageIds.length ? stageColor(z.allowedStageIds[0]) : undefined;
    ctx.fillStyle = firstColor ?? '#94a3b8';
    ctx.globalAlpha = selected ? 0.18 : 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = selected ? '#2563eb' : (firstColor ?? '#64748b');
    ctx.lineWidth = selected ? 2 : 1.2;
    ctx.stroke();

    const c = polygonCentroid(z.points);
    const cc = worldToScreen(cs, c.x, c.y);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 12px sans-serif';
    ctx.fillStyle = '#334155';
    const label = z.name || 'Vùng';
    ctx.fillText(label, cc.x, cc.y - 8);
    const names = z.allowedStageIds
      .map((id) => stages.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    if (names) {
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText(names, cc.x, cc.y + 8);
    }

    if (selected) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      for (const p of z.points) {
        const s = worldToScreen(cs, p.x, p.y);
        ctx.beginPath();
        ctx.rect(s.x - 4, s.y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  if (drawingPoints && drawingPoints.length > 0) {
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    drawingPoints.forEach((p, i) => {
      const s = worldToScreen(cs, p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    if (mouse) {
      const m = worldToScreen(cs, mouse.x, mouse.y);
      ctx.lineTo(m.x, m.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    drawingPoints.forEach((p, i) => {
      const s = worldToScreen(cs, p.x, p.y);
      ctx.fillStyle = i === 0 ? '#2563eb' : '#ffffff';
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, i === 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
}
