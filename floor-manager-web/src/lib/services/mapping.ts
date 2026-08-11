import type { BlockOrientation, Floor, FurnitureItem, Project } from '$lib/models/types';
import { getCatalogItem } from '$lib/utils/furnitureCatalog';
import type { ApiLayout, ApiPosition, ApiSnapshot } from './api';

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
		default:
			return { width: def.width, depth: def.depth, height: def.height };
	}
}

/** Position (mét, backend) -> FurnitureItem (cm, editor). 1 sản phẩm = 1 block. */
export function positionToItem(p: ApiPosition): FurnitureItem {
	const s = p.scale ?? 1;
	const orientation = (p.orientation ?? 'bottom') as BlockOrientation;
	const item: FurnitureItem = {
		id: p.productId,
		catalogId: p.productId,
		position: { x: p.x * M_TO_CM, y: p.y * M_TO_CM },
		rotation: p.rotation ?? 0,
		scale: { x: s, y: s, z: s },
		orientation,
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
	};
}

/** Layout + snapshot (positions) -> cấu trúc Project/Floor của editor */
export function layoutToProject(layout: ApiLayout, snapshot: ApiSnapshot | null): Project {
	// Dedupe: DB ràng buộc 1 position / sản phẩm / snapshot, nhưng phòng hờ
	const seen = new Set<string>();
	const furniture: FurnitureItem[] = [];
	for (const p of snapshot?.positions ?? []) {
		if (seen.has(p.productId)) continue;
		seen.add(p.productId);
		furniture.push(positionToItem(p));
	}

	const floor: Floor = {
		id: layout.id,
		name: layout.name,
		level: 0,
		walls: [],
		rooms: [],
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

/** Lấy positions từ floor đang active của project (dedupe theo productId) */
export function projectToPositions(project: Project) {
	const floor = project.floors.find((f) => f.id === project.activeFloorId) ?? project.floors[0];
	const seen = new Set<string>();
	const positions: ReturnType<typeof itemToPosition>[] = [];
	for (const it of floor?.furniture ?? []) {
		if (seen.has(it.catalogId)) continue;
		seen.add(it.catalogId);
		positions.push(itemToPosition(it));
	}
	return positions;
}
