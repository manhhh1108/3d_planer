import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { scaleToFit } from './modelFit';
import type { FurnitureDef } from './furnitureCatalog';

/** Nhóm chứa một hộp kích thước mét, giống mesh GLB backend sinh ra. */
function boxModel(w: number, h: number, d: number, tiltDeg = 0): THREE.Group {
  const g = new THREE.BoxGeometry(w, h, d);
  if (tiltDeg) g.rotateY((tiltDeg * Math.PI) / 180);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial()));
  return group;
}

function aabb(model: THREE.Group): THREE.Vector3 {
  model.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
}

const def = (widthCm: number, heightCm: number, depthCm: number): FurnitureDef => ({
  id: 'cad', name: 'CAD', category: 'Sản phẩm', icon: '📦', color: '#fff',
  width: widthCm, height: heightCm, depth: depthCm,
});
const CAD = { file: 'cad', scale: 100 } as any;

/** Ba hệ số scale lệch nhau bao nhiêu phần trăm. */
function spread(s: THREE.Vector3): number {
  const v = [s.x, s.y, s.z];
  return (Math.max(...v) - Math.min(...v)) / Math.min(...v);
}

describe('scaleToFit với khối CAD', () => {
  it('mesh đúng kích thước server đo -> ba hệ số bằng nhau, chỉ là đổi mét sang cm', () => {
    const model = boxModel(4, 2, 1);
    scaleToFit(model, def(400, 200, 100), CAD);

    expect(model.scale.x).toBeCloseTo(100, 6);
    expect(model.scale.y).toBeCloseTo(100, 6);
    expect(model.scale.z).toBeCloseTo(100, 6);
    expect(spread(model.scale)).toBeCloseTo(0, 9);
  });

  it('giữ nguyên tỉ lệ hình học sau khi ép khung', () => {
    const model = boxModel(4, 2, 1);
    scaleToFit(model, def(400, 200, 100), CAD);
    const size = aabb(model);
    // 4:2:1 phải còn nguyên 4:2:1
    expect(size.x / size.z).toBeCloseTo(4, 6);
    expect(size.y / size.z).toBeCloseTo(2, 6);
  });

  it('đặt đáy khối chạm y = 0', () => {
    const model = boxModel(4, 2, 1);
    scaleToFit(model, def(400, 200, 100), CAD);
    model.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(model).min.y).toBeCloseTo(0, 6);
  });

  /**
   * Đây là lỗi đã đẩy lên production: một bước chuẩn hoá ở client xoay mesh cho
   * thẳng trục, nhưng `def` vẫn là AABB server đo trên mesh CHƯA xoay. Hai bộ số
   * không còn khớp nên scaleToFit kéo giãn từng trục khác nhau -> khối méo và
   * nghiêng. Test này giữ cho không ai vô tình dựng lại cơ chế đó.
   */
  it('mesh bị xoay trước khi ép khung -> kéo giãn lệch, khối méo', () => {
    // Server nhận hộp lệch 20° quanh Y và đo được AABB 4.10 x 2.00 x 2.31 m
    const tilted = boxModel(4, 2, 1, 20);
    const serverDims = aabb(tilted);
    const serverDef = def(serverDims.x * 100, serverDims.y * 100, serverDims.z * 100);

    // Client nắn lại cho thẳng trục rồi mới ép khung
    const straightened = boxModel(4, 2, 1);
    scaleToFit(straightened, serverDef, CAD);

    expect(spread(straightened.scale)).toBeGreaterThan(0.5); // lệch trên 50%
    const size = aabb(straightened);
    expect(size.x / size.z).not.toBeCloseTo(4, 1); // tỉ lệ 4:1 đã hỏng
  });
});
