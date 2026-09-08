import type { CadMesh } from './geometry.js';

/** Dưới góc này coi như đã thẳng trục -> không đụng vào khối. */
const ANGLE_EPS = (3 * Math.PI) / 180;

type Vec3 = [number, number, number];

/** Jacobi eigen cho ma trận đối xứng 3x3. */
function jacobiEigen(m: number[][]): { values: number[]; vectors: Vec3[] } {
  const a = m.map((r) => r.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-12) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
      const c = Math.cos(phi), s = Math.sin(phi);
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return {
    values: [a[0][0], a[1][1], a[2][2]],
    vectors: [
      [v[0][0], v[1][0], v[2][0]],
      [v[0][1], v[1][1], v[2][1]],
      [v[0][2], v[1][2], v[2][2]],
    ],
  };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function unit(v: Vec3): Vec3 | null {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l < 1e-9 ? null : [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Nắn hình học về thẳng trục, GIỮ trục đứng của hệ toạ độ file.
 *
 * Ước lượng trục chính bằng tensor pháp tuyến có trọng số diện tích
 * M = tổng(area * n⊗n) — bất biến theo dấu pháp tuyến, hợp với khối thép nhiều
 * mặt phẳng. Eigenvector của M là các hướng mặt trội của khối.
 *
 * Trục đứng: chọn eigen-axis gần trục up nhất (Z với STEP) rồi map về đúng up,
 * để không lật ngã khối vốn dựng đứng. Trả true nếu có nắn thật.
 * Sửa positions TẠI CHỖ.
 */
export function normalizeMeshesUpright(meshes: CadMesh[], upAxis: 'z' | 'y'): boolean {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const mesh of meshes) {
    const p = mesh.positions as ArrayLike<number>;
    const idx = mesh.indices as ArrayLike<number>;
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const ia = idx[i] * 3, ib = idx[i + 1] * 3, ic = idx[i + 2] * 3;
      const ux = p[ib] - p[ia], uy = p[ib + 1] - p[ia + 1], uz = p[ib + 2] - p[ia + 2];
      const vx = p[ic] - p[ia], vy = p[ic + 1] - p[ia + 1], vz = p[ic + 2] - p[ia + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const twice = Math.hypot(nx, ny, nz);
      if (twice < 1e-12) continue;
      const area = twice / 2;
      const n: Vec3 = [nx / twice, ny / twice, nz / twice];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) M[r][c] += area * n[r] * n[c];
      }
    }
  }

  const { vectors } = jacobiEigen(M);
  const axes: Vec3[] = [];
  for (const vec of vectors) {
    const u = unit(vec);
    if (!u) return false;
    axes.push(u);
  }

  const UP: Vec3 = upAxis === 'z' ? [0, 0, 1] : [0, 1, 0];
  const SIDE: Vec3 = [1, 0, 0];

  let upIdx = 0, best = -1;
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(dot(axes[i], UP));
    if (d > best) { best = d; upIdx = i; }
  }
  let up = axes[upIdx];
  if (dot(up, UP) < 0) up = [-up[0], -up[1], -up[2]];

  const rest = axes.filter((_, i) => i !== upIdx);
  let side = Math.abs(dot(rest[1], SIDE)) > Math.abs(dot(rest[0], SIDE)) ? rest[1] : rest[0];
  if (dot(side, SIDE) < 0) side = [-side[0], -side[1], -side[2]];
  const proj = dot(side, up);
  const sideOrth = unit([
    side[0] - proj * up[0],
    side[1] - proj * up[1],
    side[2] - proj * up[2],
  ]);
  if (!sideOrth) return false;
  const third = cross(up, sideOrth);

  // R có các HÀNG là 3 trục của khối, ánh xạ chúng về trục hệ file.
  const R: Vec3[] = upAxis === 'z' ? [sideOrth, third, up] : [sideOrth, up, third];

  const trace = R[0][0] + R[1][1] + R[2][2];
  const angle = Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2)));
  if (!Number.isFinite(angle) || angle < ANGLE_EPS) return false;

  for (const mesh of meshes) {
    const p = mesh.positions as Float32Array;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = R[0][0] * x + R[0][1] * y + R[0][2] * z;
      p[i + 1] = R[1][0] * x + R[1][1] * y + R[1][2] * z;
      p[i + 2] = R[2][0] * x + R[2][1] * y + R[2][2] * z;
    }
  }
  return true;
}
