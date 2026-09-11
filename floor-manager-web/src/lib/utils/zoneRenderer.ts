/**
 * Zone rendering for the floor plan editor.
 * Pure draw function — takes canvas state + data and renders working zones.
 */
import type { CanvasState } from './canvasInteraction';
import { worldToScreen } from './canvasInteraction';
import type { Floor, Point, WorkingZone } from '$lib/models/types';
import type { ApiStage } from '$lib/services/api';
import { polygonCentroid } from './zoneGeometry';

const TITLE_FONT = '600 12px sans-serif';
const STAGE_FONT = '11px sans-serif';

/** Chữ trên nhãn vùng. Dùng chung cho vẽ và bấm trúng để hai bên không lệch nhau. */
export function zoneLabelLines(z: WorkingZone, stages: ApiStage[]): { title: string; stages: string } {
  return {
    title: (z.locked ? '🔒 ' : '') + (z.name || 'Vùng'),
    stages: z.allowedStageIds
      .map((id) => stages.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join(', '),
  };
}

/**
 * Khung (px màn hình) bao nhãn tên vùng ở trọng tâm. Bấm vào đây là chọn vùng —
 * cùng với bấm trúng viền, vì bấm vào phần tô bên trong giờ được coi là bấm nền.
 * Đo bằng chính font lúc vẽ, nên khung khớp đúng chữ đang hiện trên màn hình.
 */
export function zoneLabelRect(
  cs: CanvasState, z: WorkingZone, stages: ApiStage[],
): { x: number; y: number; w: number; h: number } {
  const { ctx } = cs;
  const c = polygonCentroid(z.points);
  const cc = worldToScreen(cs, c.x, c.y);
  const { title, stages: st } = zoneLabelLines(z, stages);
  ctx.save();
  ctx.font = TITLE_FONT;
  let w = ctx.measureText(title).width;
  const top = cc.y - 16;
  let bottom = cc.y;
  if (st) {
    ctx.font = STAGE_FONT;
    w = Math.max(w, ctx.measureText(st).width);
    bottom = cc.y + 15;
  }
  ctx.restore();
  const pad = 4;
  return { x: cc.x - w / 2 - pad, y: top - pad, w: w + pad * 2, h: bottom - top + pad * 2 };
}

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
    // Vùng khoá vẽ nét đứt chứ không đổi màu: màu viền đang dùng để báo "đang
    // chọn", đổi màu thì vùng khoá lúc được chọn sẽ mất một trong hai tín hiệu.
    // setLineDash([]) phải gọi ngay sau stroke, không thì nét đứt rò sang mọi
    // thứ vẽ sau trên cùng context.
    if (z.locked) ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    const c = polygonCentroid(z.points);
    const cc = worldToScreen(cs, c.x, c.y);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const { title, stages: names } = zoneLabelLines(z, stages);
    ctx.font = TITLE_FONT;
    ctx.fillStyle = '#334155';
    ctx.fillText(title, cc.x, cc.y - 8);
    if (names) {
      ctx.font = STAGE_FONT;
      ctx.fillStyle = '#64748b';
      ctx.fillText(names, cc.x, cc.y + 8);
    }

    // Vùng khoá không kéo đỉnh được (findZoneVertexAt bỏ qua), nên đừng vẽ tay
    // cầm — vẽ ra là mời người ta kéo một thứ không kéo được.
    if (selected && !z.locked) {
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
