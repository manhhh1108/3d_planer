/**
 * Tư thế nằm Úp / Ngửa của block đã lật nghiêng / dựng đứng.
 *
 * Lật 6 mặt chỉ xoay đúng 90° quanh trục hộp bao. Khối cong (vỏ bồn ST4…) có dây
 * cung không song song cạnh hộp bao, nên lật xong nằm chéo — đo trên dữ liệu thật
 * có khối lệch 7°. Ở đây tính thêm một phép LĂN để dây cung nằm ngang:
 *  - Úp   (prone)  — vòm lên, dây cung chạm sàn
 *  - Ngửa (supine) — bụng cong chạm sàn, dây cung nằm ngang phía trên
 *
 * Trục lăn là trục ĐỨNG CŨ của khối (sau khi lật nó nằm ngang), nên mặt phẳng lăn
 * trùng đúng mặt phẳng footprint nhìn từ trên — client đã có sẵn dữ liệu đó, không
 * cần đọc lại mesh.
 *
 * Quy ước: điểm cục bộ nằm trong mặt phẳng XZ của three.js. Footprint CAD (fx, fy)
 * ứng với (x = fx, z = −fy) vì GLB đổi trục CAD (x, y, z) → three (x, z, −y).
 */
import * as THREE from 'three';
import type { RestPose } from '$lib/models/types';

export type { RestPose };
export interface LocalPoint { x: number; z: number }

const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

/** Hướng lật nghiêng/dựng — chỉ ở đây tư thế Úp/Ngửa mới có nghĩa. */
export function isLaidOnSide(o: string | undefined): o is 'side' | 'side2' | 'end' | 'end2' {
  return o === 'side' || o === 'side2' || o === 'end' || o === 'end2';
}

/** Phép lật 90° của 6 mặt — trùng khít cách `applyOrientation` vẫn xoay xưa nay. */
export function flipQuaternion(o: string | undefined): THREE.Quaternion {
  const q = new THREE.Quaternion();
  switch (o) {
    case 'top': return q.setFromAxisAngle(AX, Math.PI);
    case 'side': return q.setFromAxisAngle(AX, Math.PI / 2);
    case 'side2': return q.setFromAxisAngle(AX, -Math.PI / 2);
    case 'end': return q.setFromAxisAngle(AZ, Math.PI / 2);
    case 'end2': return q.setFromAxisAngle(AZ, -Math.PI / 2);
    default: return q;
  }
}

/**
 * Lật rồi lăn. Lăn quanh trục đứng CŨ (Y cục bộ) và áp TRƯỚC phép lật:
 * q = lật · lăn. Đổi thứ tự là lăn quanh một trục khác hẳn.
 */
export function poseQuaternion(o: string | undefined, rollRad: number): THREE.Quaternion {
  const roll = new THREE.Quaternion().setFromAxisAngle(AY, rollRad);
  return flipQuaternion(o).multiply(roll);
}

/** 4 góc hình chữ nhật gốc — dùng khi block không có footprint CAD. */
export function rectPoints(width: number, depth: number): LocalPoint[] {
  const w = width / 2, d = depth / 2;
  return [{ x: -w, z: -d }, { x: w, z: -d }, { x: w, z: d }, { x: -w, z: d }];
}

/** Footprint CAD (catalog, cm) co giãn theo kích thước gốc → điểm cục bộ XZ. */
export function footprintPoints(rings: [number, number][][], kx: number, ky: number): LocalPoint[] {
  const out: LocalPoint[] = [];
  for (const ring of rings) for (const [fx, fy] of ring) out.push({ x: fx * kx, z: -fy * ky });
  return out;
}

/** Bao lồi (monotone chain), bỏ điểm thẳng hàng. */
function convexHull(points: LocalPoint[]): LocalPoint[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (pts.length < 3) return pts;
  const cross = (o: LocalPoint, a: LocalPoint, b: LocalPoint) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: LocalPoint[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: LocalPoint[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const worldY = (p: LocalPoint, q: THREE.Quaternion) =>
  new THREE.Vector3(p.x, 0, p.z).applyQuaternion(q).y;

/** Cạnh chỉ ngắn hơn cạnh dài nhất chừng này vẫn coi là hoà (hai cạnh dài của hộp). */
const TIE = 0.98;
/** Lệch quá góc này thì cạnh đang gần dựng đứng — người dùng chọn nhầm hướng lật. */
const MAX_ROLL = Math.PI / 4;

/**
 * Góc lăn (rad, quanh trục đứng cũ) để cạnh dài nhất của bao lồi nằm ngang, ở đáy
 * (Úp) hoặc ở đỉnh (Ngửa). Trả 0 khi không lăn.
 *
 * Chỉ san phẳng cạnh đang lệch ≤ 45°. Nhờ vậy khối hộp LUÔN ra 0: hai cạnh dài
 * song song và đã nằm ngang, một ở dưới một ở trên, nên Úp lẫn Ngửa đều có sẵn
 * một cạnh đúng phía. Không giới hạn thì hộp sâu hơn rộng sẽ bị lăn 90° khi bấm
 * Úp, đổi âm thầm hành vi Nghiêng của mọi khối hộp đang có.
 */
export function restRoll(points: LocalPoint[], o: string | undefined, pose: RestPose | undefined): number {
  if (!pose || !isLaidOnSide(o)) return 0;
  const hull = convexHull(points);
  if (hull.length < 2) return 0;

  const edges = hull.map((a, i) => {
    const b = hull[(i + 1) % hull.length];
    return { a, b, len: Math.hypot(b.x - a.x, b.z - a.z) };
  });
  const maxLen = Math.max(...edges.map((e) => e.len));
  if (!(maxLen > 0)) return 0;

  const wantBottom = pose === 'prone';
  let best: { roll: number; score: number } | null = null;
  for (const e of edges) {
    if (e.len < maxLen * TIE) continue;
    const dx = e.b.x - e.a.x, dz = e.b.z - e.a.z;
    // Góc lăn làm cạnh nằm ngang. Sau lật side, độ cao thế giới đi theo z cục bộ;
    // sau lật end thì đi theo x. Dấu đã kiểm bằng test hình học thật.
    let t = o === 'side' || o === 'side2' ? Math.atan2(dz, dx) : Math.atan2(-dx, dz);
    while (t > Math.PI / 2) t -= Math.PI;
    while (t <= -Math.PI / 2) t += Math.PI;
    if (Math.abs(t) > MAX_ROLL + 1e-9) continue;

    // Cạnh bao lồi đã nằm ngang thì cả khối nằm về một phía của nó, tức cạnh đó
    // hoặc ở đáy hoặc ở đỉnh. Sai phía so với tư thế muốn thì lăn thêm 180°.
    const q = poseQuaternion(o, t);
    const ys = hull.map((p) => worldY(p, q));
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const ey = (worldY(e.a, q) + worldY(e.b, q)) / 2;
    const atBottom = Math.abs(ey - lo) <= Math.abs(ey - hi);
    const flip = atBottom !== wantBottom;
    // Ưu tiên ứng viên không phải lật 180°, rồi tới góc lăn nhỏ nhất.
    const score = (flip ? 10 : 0) + Math.abs(t);
    if (!best || score < best.score) best = { roll: flip ? t + Math.PI : t, score };
  }
  if (!best) return 0;
  // Góc cực nhỏ là nhiễu số — trả 0 thật để khối hộp không mang góc lăn lẻ.
  return Math.abs(best.roll) < 1e-12 ? 0 : best.roll;
}

/** Kích thước chiếm chỗ sau khi lật + lăn: hộp bao của lăng trụ footprint × chiều cao gốc. */
export function posedDims(
  points: LocalPoint[], height: number, q: THREE.Quaternion,
): { width: number; depth: number; height: number } {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const p of points) {
    box.expandByPoint(v.set(p.x, 0, p.z).applyQuaternion(q));
    box.expandByPoint(v.set(p.x, height, p.z).applyQuaternion(q));
  }
  if (box.isEmpty()) return { width: 0, depth: 0, height: 0 };
  const s = box.getSize(new THREE.Vector3());
  return { width: s.x, depth: s.z, height: s.y };
}
