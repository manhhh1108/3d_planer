import { writable } from 'svelte/store';
import { api, FILES_BASE, type ApiProduct } from '../services/api';
import { setFurnitureCatalog, type FurnitureDef } from '../utils/furnitureCatalog';

/**
 * Block sản phẩm trên editor: kích thước tính bằng cm.
 * Ưu tiên metadata (mét); fallback hình vuông từ areaM2; mặc định 2x2m.
 */
export function productToDef(p: ApiProduct): FurnitureDef {
	const wM = p.metadata?.widthM ?? (p.areaM2 ? Math.sqrt(p.areaM2) : 2);
	const dM = p.metadata?.depthM ?? (p.areaM2 ? p.areaM2 / wM : 2);
	const hM = p.metadata?.heightM ?? 1;
	return {
		id: p.id,
		name: `${p.name} (${p.code})`,
		category: p.category === 'thiet_bi' ? 'Thiết bị' : 'Sản phẩm',
		icon: p.category === 'thiet_bi' ? '⚙️' : '📦',
		color: p.color,
		width: Math.max(10, Math.round(wM * 100)),
		depth: Math.max(10, Math.round(dM * 100)),
		height: Math.max(10, Math.round(hM * 100)),
		assetStatus: p.asset?.status,
		file3dUrl: p.file3dUrl ?? undefined,
	};
}

export const productCatalog = writable<FurnitureDef[]>([]);
export const productsById = writable<Map<string, ApiProduct>>(new Map());

export async function loadProductCatalog(): Promise<void> {
	const products = await api.products.list();
	const defs = await Promise.all(
		products.map(async (p) => {
			const def = productToDef(p);
			if (p.asset?.status === 'ready' && p.asset.footprintUrl) {
				try {
					const res = await fetch(`${FILES_BASE}${p.asset.footprintUrl}`);
					if (res.ok) {
						const fp: { polygons: [number, number][][] } = await res.json();
						// mét -> cm
						def.footprint = fp.polygons.map((ring) =>
							ring.map(([x, y]) => [x * 100, y * 100] as [number, number])
						);
					}
				} catch {
					/* thiếu footprint -> vẽ rect như cũ */
				}
			}
			return def;
		})
	);
	productCatalog.set(defs);
	productsById.set(new Map(products.map((p) => [p.id, p])));
	// Đồng bộ registry để getCatalogItem/canvas/3D dùng được ngay
	setFurnitureCatalog(defs);
}
