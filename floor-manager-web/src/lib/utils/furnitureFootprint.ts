import type { FurnitureItem, Point } from '$lib/models/types';
import { getCatalogItem } from './furnitureCatalog';
import { unorientDims } from '$lib/services/mapping';
import { footprintPoints, isLaidOnSide, posedDims, poseQuaternion, rectPoints, restRoll } from './restPose';

type Dims = { width: number; depth: number; height: number };

/** Kích thước đang hiển thị (đã lật) — số lưu trên item, thiếu thì lấy catalog. */
function shownDims(item: FurnitureItem): Dims {
  const cat = getCatalogItem(item.catalogId);
  return {
    width: item.width ?? cat?.width ?? 50,
    depth: item.depth ?? cat?.depth ?? 50,
    height: item.height ?? cat?.height ?? 50,
  };
}

/**
 * Góc lăn + khuôn sau lăn, nhớ theo (footprint catalog, hướng, tư thế, kích thước).
 *
 * Canvas gọi effectiveDims cho MỌI block ở MỌI frame; không nhớ thì mỗi frame tính
 * lại bao lồi của từng khối (khối ST4 ~110 điểm). Khoá theo ĐỊNH DANH object footprint
 * của catalog: catalog nạp lại là object mới, bộ nhớ cũ tự rơi khỏi WeakMap.
 */
const poseCache = new WeakMap<object, Map<string, { roll: number; dims: Dims }>>();
const NO_CATALOG = {};

function posed(item: FurnitureItem): { roll: number; dims: Dims } | null {
  const o = item.orientation ?? 'bottom';
  if (!item.pose || !isLaidOnSide(o)) return null;
  const cat = getCatalogItem(item.catalogId);
  const shown = shownDims(item);
  const owner = cat?.footprint ?? cat ?? NO_CATALOG;
  const key = `${o}|${item.pose}|${shown.width}|${shown.depth}|${shown.height}`;
  let bucket = poseCache.get(owner);
  if (!bucket) { bucket = new Map(); poseCache.set(owner, bucket); }
  const hit = bucket.get(key);
  if (hit) return hit;

  // Mesh 3D dựng theo kích thước GỐC rồi mới xoay, nên footprint cũng phải co
  // giãn theo số gốc — cùng cách ThreeViewer và itemOutline đang làm.
  const base = unorientDims(shown, o);
  const rings = (cat?.footprint ?? []).filter((r) => r.length >= 3);
  const points = cat && rings.length
    ? footprintPoints(rings, base.width / (cat.width || 1), base.depth / (cat.depth || 1))
    : rectPoints(base.width, base.depth);
  const roll = restRoll(points, o, item.pose);
  // Không lăn (khối hộp, dây cung gần dựng đứng) thì giữ ĐÚNG số cũ: tránh sai số
  // làm tròn và bảo đảm hành vi khối hộp không đổi so với trước khi có tư thế.
  const dims = roll === 0 ? shown : posedDims(points, base.height, poseQuaternion(o, roll));
  const out = { roll, dims };
  bucket.set(key, out);
  return out;
}

/** Góc lăn (rad) của block cho 3D. 0 khi không có tư thế hoặc không cần lăn. */
export function itemRestRoll(item: FurnitureItem): number {
  return posed(item)?.roll ?? 0;
}

/**
 * Kích thước CHIẾM CHỖ thật của block: width × depth trên mặt bằng, height theo
 * chiều đứng. Khối nằm Úp/Ngửa đã lăn thì là hộp bao sau lăn; còn lại là đúng số
 * đang lưu.
 *
 * Mọi chỗ cần khuôn 2D (vẽ, va chạm, xếp vùng, tự sắp xếp) phải đọc qua đây. Số
 * lưu trên item KHÔNG đổi theo phép lăn — nó vẫn là hoán vị W/D/H để unorientDims
 * đảo ngược được khi dựng mesh; hộp bao sau một góc lẻ thì không đảo được.
 */
export function effectiveDims(item: FurnitureItem): Dims {
  return posed(item)?.dims ?? shownDims(item);
}

/**
 * 4 góc hình chữ nhật bao (width × depth) của block, đã xoay theo rotation,
 * đặt quanh tâm — world cm. Dùng làm footprint để kiểm tra "trọn trong vùng".
 * Cố ý dùng bbox (bao trùm footprint CAD) => an toàn: bbox-trọn ⇒ block-trọn.
 */
export function footprintRect(center: Point, width: number, depth: number, rotationDeg: number): Point[] {
  const hw = width / 2, hd = depth / 2;
  const t = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const local: Point[] = [
    { x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd },
  ];
  return local.map((p) => ({
    x: center.x + p.x * c - p.y * s,
    y: center.y + p.x * s + p.y * c,
  }));
}

/** Footprint của một FurnitureItem (dùng override kích thước nếu có). */
export function itemFootprint(item: FurnitureItem): Point[] {
  const { width, depth } = effectiveDims(item);
  return footprintRect(item.position, width, depth, item.rotation ?? 0);
}

/**
 * Biên dạng thật của block trong toạ độ world (cm): các ring CAD đã co giãn
 * theo kích thước người dùng gõ, lật theo mặt tiếp sàn rồi xoay + dời về vị trí.
 *
 * Chỉ dùng được khi block NẰM ĐÁY (bottom/top): lật nghiêng hay dựng đứng thì
 * hình chiếu bằng là hình khác hẳn mà dữ liệu đó không có — khi đó (và khi
 * không có footprint CAD) trả về chữ nhật bao, đúng như những gì canvas vẽ.
 *
 * Ring CAD theo quy ước y HƯỚNG LÊN của bản vẽ, còn toạ độ editor y hướng
 * xuống, nên phải đổi dấu y — giống hệt bước vẽ trong canvasRenderer.
 */
export function itemOutline(item: FurnitureItem): Point[][] {
  const cat = getCatalogItem(item.catalogId);
  const width = item.width ?? cat?.width ?? 50;
  const depth = item.depth ?? cat?.depth ?? 50;
  const orientation = item.orientation ?? 'bottom';
  const laidFlat = orientation === 'bottom' || orientation === 'top';
  const usable = (cat?.footprint ?? []).filter((ring) => ring.length >= 3);
  // Nghiêng/dựng dùng hộp bao chiếm chỗ thật — đã tính cả phép lăn Úp/Ngửa.
  const bbox = () => {
    const e = effectiveDims(item);
    return [footprintRect(item.position, e.width, e.depth, item.rotation ?? 0)];
  };

  if (!cat || !laidFlat || usable.length === 0) return bbox();

  const kx = width / (cat.width || 1);
  const ky = depth / (cat.depth || 1);
  const mirrorY = orientation === 'top' ? -1 : 1;
  const t = ((item.rotation ?? 0) * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);

  return usable.map((ring) =>
    ring.map(([fx, fy]) => {
      const lx = fx * kx;
      const ly = -fy * ky * mirrorY;
      return {
        x: item.position.x + lx * c - ly * s,
        y: item.position.y + lx * s + ly * c,
      };
    }),
  );
}
