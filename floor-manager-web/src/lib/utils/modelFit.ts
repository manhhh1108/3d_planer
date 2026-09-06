import * as THREE from 'three';
import type { FurnitureDef } from './furnitureCatalog';

/** Model dựng sẵn (Kenney) hoặc mesh CAD do backend sinh ra. */
export interface ModelMapping {
  file: string;
  scale?: number;       // uniform scale multiplier
  rotateY?: number;     // additional Y rotation in radians
  offsetY?: number;     // vertical offset
}

/**
 * Ép model vừa khung kích thước của block trong danh mục.
 *
 * Với khối CAD, `def` lấy từ AABB mà server đo LÚC IMPORT, nên chừng nào client
 * không đụng vào hình học thì ba hệ số scale bằng nhau — chỉ là phép đổi đơn vị
 * mét sang cm. Hễ có ai xoay mesh trước bước này là ba hệ số lệch nhau và khối
 * bị kéo méo; xem scaleToFit.test.ts.
 *
 * Tách khỏi furnitureModelLoader để test được: file kia kéo theo $app/paths
 * và GLTFLoader, không nạp nổi ngoài trình duyệt.
 */
export function scaleToFit(model: THREE.Group, def: FurnitureDef, mapping: ModelMapping): void {
  // Compute the model's bounding box
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  const EPSILON = 0.001;
  if (size.x < EPSILON || size.y < EPSILON || size.z < EPSILON) return;

  // Detect Z-up orientation: only rotate if Y is near-zero (truly flat/degenerate)
  // Don't rotate models that are just naturally short (like beds, tables)
  if (size.y < 0.01 && size.z > size.y * 10) {
    model.rotation.x = -Math.PI / 2;
    model.updateMatrixWorld(true);
    // Recompute bounding box after rotation
    box.setFromObject(model);
    box.getSize(size);
  }

  // Scale to match our catalog dimensions (in cm) — non-uniform to fill exact footprint
  // Our convention: width=X, height=Y, depth=Z
  const scaleX = def.width / size.x;
  const scaleY = def.height / size.y;
  const scaleZ = def.depth / size.z;

  model.scale.set(scaleX, scaleY, scaleZ);

  // Re-center at origin after scaling
  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  model.position.sub(center);
  // Put bottom on ground plane
  model.position.y -= scaledBox.min.y;

  // Recompute after repositioning
  const finalBox = new THREE.Box3().setFromObject(model);
  model.position.y -= finalBox.min.y;
}
