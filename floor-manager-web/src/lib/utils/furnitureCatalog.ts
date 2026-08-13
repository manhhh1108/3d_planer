export interface FurnitureDef {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  /** width x depth x height in cm */
  width: number;
  depth: number;
  height: number;
  /** If set, this is a 2D-only architectural symbol (not rendered in 3D) */
  symbol?: boolean;
  /** Footprint polygon (cm, canh tâm block) từ CAD asset — vẽ thay rect khi có */
  footprint?: [number, number][][];
  /** Trạng thái convert CAD của product (nếu có asset) */
  assetStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  /** URL mesh.glb (đường dẫn tương đối backend) cho viewer 3D */
  file3dUrl?: string;
}

/**
 * Catalog động: nạp từ danh sách sản phẩm của backend lúc runtime
 * (xem $lib/stores/productCatalog). Giữ dạng mảng mutable để mọi consumer
 * hiện có (getCatalogItem, CommandPalette, ThreeViewer...) dùng nguyên tham chiếu.
 */
export const furnitureCatalog: FurnitureDef[] = [];

/** Danh mục hiện có, đồng bộ mỗi lần setFurnitureCatalog */
export const furnitureCategories: string[] = [];

export function setFurnitureCatalog(defs: FurnitureDef[]) {
  furnitureCatalog.length = 0;
  furnitureCatalog.push(...defs);
  furnitureCategories.length = 0;
  furnitureCategories.push(...new Set(defs.map((f) => f.category)));
}

export function getCatalogItem(id: string): FurnitureDef | undefined {
  return furnitureCatalog.find(f => f.id === id);
}
