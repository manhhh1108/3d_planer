import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyOrientation } from './blockOrientation';
import { restRoll, type LocalPoint } from './restPose';

/** Mesh chỉ cần đỉnh: Box3.setFromObject đo trên position attribute. */
function meshFrom(points: LocalPoint[], height: number): THREE.Mesh {
  const arr: number[] = [];
  for (const p of points) arr.push(p.x, 0, p.z, p.x, height, p.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return new THREE.Mesh(g);
}

/** Dải cung lệch `tiltDeg`, trả cả hai mũi mép trong (đầu dây cung). */
function arcBand(tiltDeg: number, R = 400, t = 30, spanDeg = 150, n = 48) {
  const a0 = Math.PI / 2 - (spanDeg * Math.PI) / 360;
  const a1 = Math.PI / 2 + (spanDeg * Math.PI) / 360;
  const phi = (tiltDeg * Math.PI) / 180;
  const at = (r: number, a: number): LocalPoint => {
    const x = r * Math.cos(a), z = r * Math.sin(a);
    return { x: x * Math.cos(phi) - z * Math.sin(phi), z: x * Math.sin(phi) + z * Math.cos(phi) };
  };
  const outer: LocalPoint[] = [], inner: LocalPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    outer.push(at(R, a)); inner.push(at(R - t, a));
  }
  return { points: [...outer, ...inner.slice().reverse()], tips: [inner[0], inner[n]] };
}

const worldOf = (model: THREE.Object3D, p: LocalPoint, y = 0) => {
  model.updateMatrixWorld(true);
  return new THREE.Vector3(p.x, y, p.z).applyMatrix4(model.matrixWorld);
};

describe('applyOrientation', () => {
  it('góc lăn 0: trùng khít phép lật 90° cũ ở cả 6 mặt', () => {
    // Đổi từ rotation.x/z sang quaternion không được làm lệch dù một li block cũ.
    const old: Record<string, THREE.Euler> = {
      bottom: new THREE.Euler(0, 0, 0),
      top: new THREE.Euler(Math.PI, 0, 0),
      side: new THREE.Euler(Math.PI / 2, 0, 0),
      side2: new THREE.Euler(-Math.PI / 2, 0, 0),
      end: new THREE.Euler(0, 0, Math.PI / 2),
      end2: new THREE.Euler(0, 0, -Math.PI / 2),
    };
    for (const [o, e] of Object.entries(old)) {
      const m = new THREE.Group();
      applyOrientation(m, o);
      const want = new THREE.Quaternion().setFromEuler(e);
      expect(m.quaternion.angleTo(want), o).toBeLessThan(1e-9);
    }
  });

  it('khối cong nằm Úp: hai mũi chạm đúng mặt sàn y = 0', () => {
    const { points, tips } = arcBand(36);
    const H = 338;
    const g = new THREE.Group();
    g.add(meshFrom(points, H));
    applyOrientation(g, 'side', restRoll(points, 'side', 'prone'));
    // Mũi nằm ở hai mặt cắt đầu (y=0 và y=H cục bộ) — kiểm cả hai
    for (const y of [0, H]) {
      const a = worldOf(g, tips[0], y), b = worldOf(g, tips[1], y);
      // 3 chữ số (< 5 µm): mesh là Float32, giá trị ~400cm chỉ còn ~1e-5 độ chính xác
      expect(a.y, 'mũi 1 chạm sàn').toBeCloseTo(0, 3);
      expect(b.y, 'mũi 2 chạm sàn').toBeCloseTo(0, 3);
    }
  });

  it('khối cong nằm Ngửa: hai mũi ngang nhau ở trên cùng, bụng chạm sàn', () => {
    const { points, tips } = arcBand(36);
    const H = 338;
    const g = new THREE.Group();
    g.add(meshFrom(points, H));
    applyOrientation(g, 'side', restRoll(points, 'side', 'supine'));
    // precise = true: đo mặc định xoay 8 góc hộp cục bộ nên phình ra khi có góc lăn
    // lẻ — chính cái bẫy applyOrientation vừa được sửa.
    const box = new THREE.Box3().setFromObject(g, true);
    const a = worldOf(g, tips[0]), b = worldOf(g, tips[1]);
    expect(a.y).toBeCloseTo(b.y, 3);
    expect(a.y).toBeCloseTo(box.max.y, 3);
    expect(box.min.y).toBeCloseTo(0, 3); // vẫn đặt trên sàn, không chìm
  });

  it('không lăn thì khối cong nằm chéo — đúng lỗi người dùng báo', () => {
    // Chốt lại hiện trạng để thấy phép lăn thực sự đã sửa gì.
    const { points, tips } = arcBand(36);
    const g = new THREE.Group();
    g.add(meshFrom(points, 338));
    applyOrientation(g, 'side', 0);
    const a = worldOf(g, tips[0]), b = worldOf(g, tips[1]);
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(100); // lệch vài mét, không phải sai số
  });
});
