import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { poseQuaternion, restRoll, posedDims, rectPoints, type LocalPoint, type RestPose } from './restPose';
import { orientedDims } from '$lib/services/mapping';

/**
 * Kiểm bằng HÌNH HỌC THẬT: áp quaternion lên điểm rồi đo độ cao thế giới. Không
 * kiểm công thức góc — dấu (+/−) của phép lăn rất dễ ngược mà công thức vẫn
 * "trông đúng". Ở đây sai dấu là hai đầu dây cung lệch độ cao ngay.
 */
const worldY = (p: LocalPoint, q: THREE.Quaternion) =>
  new THREE.Vector3(p.x, 0, p.z).applyQuaternion(q).y;

/**
 * Dải cung (mép ngoài bán kính R, dày t) mở `spanDeg`, đối xứng quanh trục +z,
 * rồi xoay cả hình `tiltDeg` trong mặt phẳng footprint.
 *
 * Với cung < 180°, cạnh dài nhất của bao lồi là dây nối HAI ĐẦU MÉP TRONG — song
 * song với dây cung người dùng kẻ giữa hai mũi. Nên kiểm trên hai điểm đó.
 */
function arcBand(tiltDeg: number, R = 400, t = 30, spanDeg = 150, n = 48) {
  const a0 = Math.PI / 2 - (spanDeg * Math.PI) / 360;
  const a1 = Math.PI / 2 + (spanDeg * Math.PI) / 360;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    outer.push([R * Math.cos(a), R * Math.sin(a)]);
    inner.push([(R - t) * Math.cos(a), (R - t) * Math.sin(a)]);
  }
  const phi = (tiltDeg * Math.PI) / 180;
  const rot = ([x, z]: [number, number]): LocalPoint => ({
    x: x * Math.cos(phi) - z * Math.sin(phi),
    z: x * Math.sin(phi) + z * Math.cos(phi),
  });
  const points = [...outer, ...inner.slice().reverse()].map(rot);
  return { points, tips: [rot(inner[0]), rot(inner[n])] as const };
}

const SIDE = ['side', 'side2'] as const;
const END = ['end', 'end2'] as const;
const ALL = [...SIDE, ...END] as const;
const POSES: RestPose[] = ['prone', 'supine'];

/** Hai đầu dây cung cao bằng nhau, và nằm đúng đáy (úp) / đỉnh (ngửa). */
function expectLevel(points: LocalPoint[], tips: readonly LocalPoint[], o: string, pose: RestPose) {
  const q = poseQuaternion(o, restRoll(points, o, pose));
  const ya = worldY(tips[0], q), yb = worldY(tips[1], q);
  expect(Math.abs(ya - yb), `${o}/${pose}: hai đầu dây cung lệch nhau`).toBeLessThan(1e-6);
  const ys = points.map((p) => worldY(p, q));
  const target = pose === 'prone' ? Math.min(...ys) : Math.max(...ys);
  expect(Math.abs(ya - target), `${o}/${pose}: dây cung không nằm ${pose === 'prone' ? 'dưới' : 'trên'}`).toBeLessThan(1e-6);
}

describe('restRoll — khối cong', () => {
  it('lệch 36°: nằm Nghiêng thì san phẳng được dây cung, cả úp lẫn ngửa', () => {
    const { points, tips } = arcBand(36);
    for (const o of SIDE) for (const pose of POSES) expectLevel(points, tips, o, pose);
  });

  it('lệch 36°: nằm Dựng thì dây cung gần dựng đứng (54°) — không lăn', () => {
    const { points } = arcBand(36);
    for (const o of END) for (const pose of POSES) expect(restRoll(points, o, pose)).toBe(0);
  });

  it('lệch 126°: ngược lại, Dựng san phẳng được, Nghiêng thì không', () => {
    const { points, tips } = arcBand(126);
    for (const o of END) for (const pose of POSES) expectLevel(points, tips, o, pose);
    for (const o of SIDE) for (const pose of POSES) expect(restRoll(points, o, pose)).toBe(0);
  });

  it('lệch 83° (đo được trên khối ST4 thật): Dựng san phẳng được 7°', () => {
    const { points, tips } = arcBand(83);
    for (const o of END) for (const pose of POSES) expectLevel(points, tips, o, pose);
  });

  it('úp và ngửa khác nhau đúng 180°', () => {
    const { points } = arcBand(36);
    const d = restRoll(points, 'side', 'supine') - restRoll(points, 'side', 'prone');
    expect(Math.abs(Math.abs(d) - Math.PI)).toBeLessThan(1e-9);
  });
});

describe('restRoll — khối hộp không bao giờ bị lăn', () => {
  // Đây là lý do có giới hạn 45°: không có nó, hộp sâu hơn rộng sẽ bị lăn 90°
  // khi bấm Úp, âm thầm đổi hành vi Nghiêng của mọi khối hộp đang có.
  for (const [w, d] of [[300, 200], [200, 300], [250, 250]]) {
    it(`${w}×${d}: góc lăn = 0 ở cả 4 hướng × úp/ngửa`, () => {
      const pts = rectPoints(w, d);
      for (const o of ALL) for (const pose of POSES) expect(restRoll(pts, o, pose)).toBe(0);
    });
  }

  it('không có pose → không lăn', () => {
    expect(restRoll(arcBand(36).points, 'side', undefined)).toBe(0);
  });

  it('nằm đáy / lật úp 180° → không lăn dù có pose', () => {
    const { points } = arcBand(36);
    expect(restRoll(points, 'bottom', 'prone')).toBe(0);
    expect(restRoll(points, 'top', 'prone')).toBe(0);
  });

  it('không có điểm nào → không lăn', () => {
    expect(restRoll([], 'side', 'prone')).toBe(0);
  });
});

describe('posedDims', () => {
  it('lăn 0° thì trùng khít orientedDims — phép lăn không làm lệch kích thước cũ', () => {
    const base = { width: 300, depth: 200, height: 150 };
    const pts = rectPoints(base.width, base.depth);
    for (const o of ALL) {
      const got = posedDims(pts, base.height, poseQuaternion(o, 0));
      const want = orientedDims(base, o);
      expect(got.width).toBeCloseTo(want.width, 6);
      expect(got.depth).toBeCloseTo(want.depth, 6);
      expect(got.height).toBeCloseTo(want.height, 6);
    }
  });

  it('khối cong đã san phẳng: bề ngang ≥ dây cung, chiều sâu = chiều cao gốc', () => {
    const { points, tips } = arcBand(36);
    const chord = Math.hypot(tips[1].x - tips[0].x, tips[1].z - tips[0].z);
    const H = 338;
    const q = poseQuaternion('side', restRoll(points, 'side', 'prone'));
    const d = posedDims(points, H, q);
    expect(d.width).toBeGreaterThanOrEqual(chord - 1e-6);
    expect(d.depth).toBeCloseTo(H, 6); // trục đứng cũ nằm ngang theo chiều sâu
  });
});
