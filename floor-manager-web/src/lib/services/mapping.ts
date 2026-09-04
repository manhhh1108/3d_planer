import type { BlockOrientation, Floor, FurnitureItem, Project, Wall, WorkingZone } from '$lib/models/types';
import { getCatalogItem } from '$lib/utils/furnitureCatalog';
import type { ApiLayout, ApiPosition, ApiSnapshot, ApiWall, ApiZone } from './api';

/** Editor dùng cm, backend dùng mét */
export const M_TO_CM = 100;

/** yyyy-MM-dd theo giờ địa phương (ngày snapshot) */
export function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Kích thước block (cm) theo mặt tiếp sàn.
 * bottom: đáy chạm sàn (mặc định) — footprint W×D, cao H
 * side:   nằm nghiêng (mặt bên chạm sàn) — footprint W×H, cao D
 * end:    dựng đứng (mặt đầu chạm sàn) — footprint H×D, cao W
 */
export function orientedDims(
	def: { width: number; depth: number; height: number },
	o: BlockOrientation
): { width: number; depth: number; height: number } {
	switch (o) {
		case 'side':
			return { width: def.width, depth: def.height, height: def.depth };
		case 'end':
			return { width: def.height, depth: def.depth, height: def.width };
		// Lật úp chỉ quay block 180°, ba chiều giữ nguyên như khi nằm đáy
		case 'top':
		default:
			return { width: def.width, depth: def.depth, height: def.height };
	}
}

/**
 * Hoán vị NGƯỢC của orientedDims: từ kích thước đang hiển thị (đã lật) suy ra
 * kích thước gốc lúc block nằm đáy.
 *
 * 3D cần số gốc để dựng mesh đúng tỉ lệ rồi mới xoay; nếu đưa thẳng số đã lật
 * vào thì mesh bị kéo giãn méo thay vì được lật.
 */
export function unorientDims(
	shown: { width: number; depth: number; height: number },
	o: BlockOrientation
): { width: number; depth: number; height: number } {
	switch (o) {
		case 'side':
			// side: {w, h, d} <- gốc {w, d, h}
			return { width: shown.width, depth: shown.height, height: shown.depth };
		case 'end':
			// end: {h, d, w} <- gốc {w, d, h}
			return { width: shown.height, depth: shown.depth, height: shown.width };
		case 'top':
		default:
			return { ...shown };
	}
}

/** Position (mét, backend) -> FurnitureItem (cm, editor). */
export function positionToItem(p: ApiPosition): FurnitureItem {
	const s = p.scale ?? 1;
	const orientation = (p.orientation ?? 'bottom') as BlockOrientation;
	const item: FurnitureItem = {
		id: p.id,
		catalogId: p.productId,
		position: { x: p.x * M_TO_CM, y: p.y * M_TO_CM },
		rotation: p.rotation ?? 0,
		scale: { x: s, y: s, z: s },
		orientation,
		elevation: (p.elevationM ?? 0) * M_TO_CM,
		stageId: p.stageId ?? undefined,
		updatedBy: p.updatedBy ?? null,
		updatedAt: p.updatedAt ?? null,
	};
	// Lật khác mặc định -> ghi override kích thước để canvas/3D vẽ đúng
	if (orientation !== 'bottom') {
		const def = getCatalogItem(p.productId);
		if (def) {
			const d = orientedDims(def, orientation);
			item.width = d.width;
			item.depth = d.depth;
			item.height = d.height;
		}
	}
	return item;
}

export function itemToPosition(it: FurnitureItem) {
	return {
		productId: it.catalogId,
		x: it.position.x / M_TO_CM,
		y: it.position.y / M_TO_CM,
		rotation: it.rotation ?? 0,
		scale: it.scale?.x ?? 1,
		orientation: it.orientation ?? 'bottom',
		elevationM: (it.elevation ?? 0) / M_TO_CM,
		stageId: it.stageId ?? null,
	};
}

/** Wall (mét, backend) -> Wall (cm, editor). */
export function apiWallToWall(w: ApiWall): Wall {
	const wall: Wall = {
		id: w.id,
		start: { x: w.start.x * M_TO_CM, y: w.start.y * M_TO_CM },
		end: { x: w.end.x * M_TO_CM, y: w.end.y * M_TO_CM },
		thickness: w.thickness * M_TO_CM,
		height: w.height * M_TO_CM,
		color: w.color,
	};
	if (w.curvePoint) {
		wall.curvePoint = { x: w.curvePoint.x * M_TO_CM, y: w.curvePoint.y * M_TO_CM };
	}
	return wall;
}

/** Wall (cm, editor) -> Wall (mét, backend). */
export function wallToApiWall(w: Wall): ApiWall {
	const out: ApiWall = {
		id: w.id,
		start: { x: w.start.x / M_TO_CM, y: w.start.y / M_TO_CM },
		end: { x: w.end.x / M_TO_CM, y: w.end.y / M_TO_CM },
		thickness: w.thickness / M_TO_CM,
		height: w.height / M_TO_CM,
		color: w.color,
	};
	if (w.curvePoint) {
		out.curvePoint = { x: w.curvePoint.x / M_TO_CM, y: w.curvePoint.y / M_TO_CM };
	}
	return out;
}

/** Zone (mét, backend) -> WorkingZone (cm, editor). */
export function apiZoneToZone(z: ApiZone): WorkingZone {
	return {
		id: z.id,
		name: z.name,
		points: z.points.map((p) => ({ x: p.x * M_TO_CM, y: p.y * M_TO_CM })),
		allowedStageIds: z.allowedStageIds ?? [],
	};
}

/** WorkingZone (cm, editor) -> Zone (mét, backend). */
export function zoneToApiZone(z: WorkingZone): ApiZone {
	return {
		id: z.id,
		name: z.name,
		points: z.points.map((p) => ({ x: p.x / M_TO_CM, y: p.y / M_TO_CM })),
		allowedStageIds: z.allowedStageIds ?? [],
	};
}

/** Lấy zones từ floor đang active. */
export function projectToZones(project: Project): ApiZone[] {
	const floor = project.floors.find((f) => f.id === project.activeFloorId) ?? project.floors[0];
	return (floor?.zones ?? []).map(zoneToApiZone);
}

/** Lấy tường từ floor đang active của project */
export function projectToWalls(project: Project): ApiWall[] {
	const floor = project.floors.find((f) => f.id === project.activeFloorId) ?? project.floors[0];
	return (floor?.walls ?? []).map(wallToApiWall);
}

/** Layout + snapshot (positions) -> cấu trúc Project/Floor của editor */
export function layoutToProject(layout: ApiLayout, snapshot: ApiSnapshot | null): Project {
	const furniture: FurnitureItem[] = (snapshot?.positions ?? []).map(positionToItem);

	const floor: Floor = {
		id: layout.id,
		name: layout.name,
		level: 0,
		walls: (layout.walls ?? []).map(apiWallToWall),
		rooms: [],
		zones: (snapshot?.zones ?? []).map(apiZoneToZone),
		doors: [],
		windows: [],
		furniture,
		stairs: [],
		columns: [],
		guides: [],
		measurements: [],
		annotations: [],
		textAnnotations: [],
		groups: [],
		entourage: [],
	};

	return {
		id: layout.id,
		name: layout.name,
		floors: [floor],
		activeFloorId: floor.id,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

/** Lấy positions từ floor đang active của project */
export function projectToPositions(project: Project) {
	const floor = project.floors.find((f) => f.id === project.activeFloorId) ?? project.floors[0];
	return (floor?.furniture ?? []).map(itemToPosition);
}
