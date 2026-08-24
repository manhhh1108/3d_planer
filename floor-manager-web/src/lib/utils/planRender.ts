/**
 * Vẽ mặt bằng ra ngoài canvas của editor: bản in, PNG, PDF, SVG.
 *
 * Bốn nơi đó trước đây mỗi nơi tự tính khung bao và tự vẽ, và cả bốn đều chỉ
 * duyệt `floor.furniture` — nên tường vẽ trên màn hình thì có mà in ra thì mất.
 * Gom về đây để thêm loại phần tử mới chỉ phải sửa một chỗ.
 */
import type { Floor, Wall } from '$lib/models/types';
import { getCatalogItem } from '$lib/utils/furnitureCatalog';
import { wallOutline, tracePolygon } from '$lib/utils/canvasRenderer';

export interface PlanBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/** Toạ độ thế giới -> toạ độ đích, chỉ tịnh tiến */
type Offset = { x: number; y: number };
const shift = (o: Offset) => (x: number, y: number) => ({ x: x + o.x, y: y + o.y });

/** Mặt bằng có gì để vẽ không — tường cũng tính, không riêng block sản phẩm */
export function planHasContent(floor: Floor | null | undefined): boolean {
	return !!floor && (floor.furniture.length > 0 || floor.walls.length > 0);
}

/** Kích thước block đã tính override của từng bản đặt */
export function itemFootprint(fi: Floor['furniture'][number]): { w: number; d: number } {
	const cat = getCatalogItem(fi.catalogId);
	return {
		w: fi.width ?? cat?.width ?? 30,
		d: fi.depth ?? cat?.depth ?? 30,
	};
}

/**
 * Khung bao của toàn bộ mặt bằng, tính cả tường lẫn block.
 *
 * Block tính theo kích thước thật chứ không phải một khoảng đệm cố định — bản
 * cũ dùng ±50cm nên block lớn bị cắt mất mép khi xuất file.
 */
export function floorPlanBounds(floor: Floor | null | undefined): PlanBounds | null {
	if (!floor) return null;
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	const grow = (x: number, y: number) => {
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	};

	for (const w of floor.walls) {
		const half = w.thickness / 2;
		for (const pt of [w.start, w.end, ...(w.curvePoint ? [w.curvePoint] : [])]) {
			grow(pt.x - half, pt.y - half);
			grow(pt.x + half, pt.y + half);
		}
	}
	for (const fi of floor.furniture) {
		const { w, d } = itemFootprint(fi);
		grow(fi.position.x - w / 2, fi.position.y - d / 2);
		grow(fi.position.x + w / 2, fi.position.y + d / 2);
	}

	return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

const WALL_FILL = '#4b5563';
const WALL_STROKE = '#1f2937';

/**
 * Vẽ tường lên canvas 2D. Toạ độ tính bằng cm thế giới cộng `offset`; gọi
 * trước khi vẽ block để block nằm đè lên tường như trên màn hình.
 */
export function drawWallsToCanvas(
	ctx: CanvasRenderingContext2D,
	walls: Wall[],
	offset: Offset = { x: 0, y: 0 },
	strokeWidth = 1,
): void {
	const project = shift(offset);
	for (const w of walls) {
		const pts = wallOutline(w, w.thickness, project);
		if (pts.length === 0) continue;
		ctx.save();
		ctx.fillStyle = w.color || WALL_FILL;
		ctx.strokeStyle = WALL_STROKE;
		ctx.lineWidth = strokeWidth;
		tracePolygon(ctx, pts);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
}

/** Tường dưới dạng thẻ <polygon> cho bản xuất SVG */
export function wallsToSvg(walls: Wall[], offset: Offset = { x: 0, y: 0 }): string {
	const project = shift(offset);
	let out = '';
	for (const w of walls) {
		const pts = wallOutline(w, w.thickness, project);
		if (pts.length === 0) continue;
		const coords = pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
		out += `  <polygon points="${coords}" fill="${w.color || WALL_FILL}" stroke="${WALL_STROKE}" stroke-width="0.5"/>\n`;
	}
	return out;
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}
