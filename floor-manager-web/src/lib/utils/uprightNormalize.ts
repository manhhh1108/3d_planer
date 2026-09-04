/**
 * Chuẩn hóa hướng khối CAD import về trục thế giới ("upright normalize").
 *
 * Vì sao: mesh sinh từ STEP có thể được kỹ sư dựng ở hướng bất kỳ (xoay lệch
 * trục). Hệ thống 3D lại giả định trục local của mesh khớp width=X/height=Y/
 * depth=Z và mặt đáy hướng xuống. Với khối bất đối xứng bị dựng lệch, các phép
 * lật (side/end xoay quanh trục THẾ GIỚI) không rơi đúng mặt → khối nghiêng,
 * chỉ chạm sàn bằng một góc (nhìn như lơ lửng).
 *
 * Cách làm: ước lượng các TRỤC CHÍNH của khối từ pháp tuyến các mặt (area-
 * weighted normal tensor M = Σ area·(n⊗n) — bất biến theo dấu pháp tuyến), lấy
 * eigenvector của M rồi dựng một phép quay đưa các trục đó về trùng trục thế
 * giới. GIỮ NGUYÊN trục đứng do CAD định (trục eigen gần +Y nhất được map về Y),
 * để không lật ngã khối đứng (vòm) thành nằm.
 *
 * An toàn với khối đã thẳng trục: M chéo → eigenvector ≈ trục thế giới →
 * quay ≈ identity. Có ngưỡng no-op: lệch dưới ~ANGLE_EPS thì trả về identity,
 * nên khối đang đúng (nón, platform) không bị đụng tới. Khối đối xứng (nón) có
 * eigenvalue suy biến ở mặt phẳng ngang → chọn trục ngang tùy ý, nhưng footprint
 * tròn/vuông xoay quanh trục đứng nhìn không đổi nên vô hại.
 */
import * as THREE from 'three';

/** Dưới góc lệch này coi như đã thẳng trục — trả identity để không đụng khối đang đúng. */
const ANGLE_EPS = 3 * (Math.PI / 180);

type Vec3 = [number, number, number];

/** Jacobi eigen cho ma trận đối xứng 3x3. Trả eigenvalue + eigenvector trực chuẩn. */
function jacobiEigenSymmetric(m: number[][]): { values: number[]; vectors: Vec3[] } {
  // m là 3x3 đối xứng, sẽ bị sửa tại chỗ trên bản sao.
  const a = [
    [m[0][0], m[0][1], m[0][2]],
    [m[1][0], m[1][1], m[1][2]],
    [m[2][0], m[2][1], m[2][2]],
  ];
  // V = ma trận eigenvector (cột), khởi tạo identity.
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    // Off-diagonal lớn nhất
    let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-12) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      const apq = a[p][q];
      if (Math.abs(apq) < 1e-15) continue;
      const app = a[p][p];
      const aqq = a[q][q];
      const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      // Xoay a: a' = J^T a J
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k];
        const aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      // Cập nhật eigenvector: V = V J
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p];
        const vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const values = [a[0][0], a[1][1], a[2][2]];
  const vectors: Vec3[] = [
    [v[0][0], v[1][0], v[2][0]],
    [v[0][1], v[1][1], v[2][1]],
    [v[0][2], v[1][2], v[2][2]],
  ];
  return { values, vectors };
}

function normalize3(x: number, y: number, z: number): Vec3 | null {
  const len = Math.hypot(x, y, z);
  if (len < 1e-9) return null;
  return [x / len, y / len, z / len];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Ước lượng tensor pháp tuyến có trọng số diện tích từ mesh tam giác.
 * M = Σ area · (n⊗n). Bất biến theo dấu pháp tuyến.
 */
function normalTensor(positions: ArrayLike<number>, indices: ArrayLike<number>): number[][] {
  const M = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const p = (i: number): Vec3 => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = p(indices[i]);
    const b = p(indices[i + 1]);
    const c = p(indices[i + 2]);
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = cross3(ab, ac);
    const twiceArea = Math.hypot(cr[0], cr[1], cr[2]);
    if (twiceArea < 1e-12) continue;
    const area = twiceArea / 2;
    const n: Vec3 = [cr[0] / twiceArea, cr[1] / twiceArea, cr[2] / twiceArea];
    for (let r = 0; r < 3; r++) {
      for (let cc = 0; cc < 3; cc++) {
        M[r][cc] += area * n[r] * n[cc];
      }
    }
  }
  return M;
}

const WORLD: Record<'x' | 'y' | 'z', Vec3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

/**
 * Tính quaternion đưa khối về thẳng trục thế giới (giữ trục đứng theo CAD).
 * Trả về THREE.Quaternion. Nếu khối đã thẳng (hoặc mesh rỗng) → quaternion identity.
 *
 * Áp dụng: model.quaternion.premultiply(q) hoặc model.applyQuaternion(q) trước
 * khi đo/đặt sàn.
 */
export function computeUprightQuaternion(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
): THREE.Quaternion {
  const identity = new THREE.Quaternion();
  if (!positions || !indices || indices.length < 3) return identity;

  const M = normalTensor(positions, indices);
  const { values, vectors } = jacobiEigenSymmetric(M);

  // Trực chuẩn hóa eigenvector (Jacobi thường đã trực chuẩn, chuẩn lại cho chắc).
  const axes: { v: Vec3; val: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const nv = normalize3(vectors[i][0], vectors[i][1], vectors[i][2]);
    if (!nv) return identity; // suy biến hoàn toàn → không làm gì
    axes.push({ v: nv, val: values[i] });
  }

  // Chọn trục ĐỨNG = eigen-axis gần +Y nhất (giữ hướng đứng do CAD định).
  let upIdx = 0;
  let bestUp = -1;
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(dot3(axes[i].v, WORLD.y));
    if (d > bestUp) { bestUp = d; upIdx = i; }
  }
  let up = axes[upIdx].v;
  if (dot3(up, WORLD.y) < 0) up = [-up[0], -up[1], -up[2]];

  // Hai trục còn lại: chọn trục gần +X nhất làm X, cái kia suy ra để thuận tay phải.
  const rest = axes.filter((_, i) => i !== upIdx).map((a) => a.v);
  let xAxis = rest[0];
  if (Math.abs(dot3(rest[1], WORLD.x)) > Math.abs(dot3(rest[0], WORLD.x))) xAxis = rest[1];
  if (dot3(xAxis, WORLD.x) < 0) xAxis = [-xAxis[0], -xAxis[1], -xAxis[2]];
  // Khử thành phần dọc theo up để trực giao, rồi chuẩn hóa.
  const proj = dot3(xAxis, up);
  let x: Vec3 | null = normalize3(xAxis[0] - proj * up[0], xAxis[1] - proj * up[1], xAxis[2] - proj * up[2]);
  if (!x) return identity;
  // z = x × up (thuận tay phải: X×? ; ta muốn cột [X up Z] có det +1 ⇒ Z = X×Y? Không:
  // với hàng R = [x; up; z], để R là phép quay det+1 cần z = cross(x, up)).
  const z = cross3(x, up);

  // R (world_from_mesh): các HÀNG là x, up, z ⇒ R·x=X, R·up=Y, R·z=Z.
  const R = new THREE.Matrix4();
  R.set(
    x[0], x[1], x[2], 0,
    up[0], up[1], up[2], 0,
    z[0], z[1], z[2], 0,
    0, 0, 0, 1,
  );
  const q = new THREE.Quaternion().setFromRotationMatrix(R);

  // No-op nếu góc quay quá nhỏ (khối đã thẳng trục) — bảo vệ khối đang đúng.
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  if (angle < ANGLE_EPS) return identity;

  return q;
}

/**
 * Nướng (bake) phép quay chuẩn hóa vào GEOMETRY của mesh CAD, để khối thẳng trục
 * trước khi scale phi-đều (nếu chỉ để phép quay ở node rồi scale phi-đều sẽ gây
 * méo/shear vì thứ tự T·R·S).
 *
 * Giả định: glb do backend sinh có node identity (mesh nằm ngay hệ toạ độ nhóm),
 * đúng với server/cad/glb.ts. Chỉ gọi cho mesh CAD, không gọi cho model Kenney.
 * No-op nếu khối đã thẳng trục.
 */
export function normalizeModelUpright(model: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  model.traverse((c) => {
    const m = c as THREE.Mesh;
    if ((m as unknown as { isMesh?: boolean }).isMesh && m.geometry) meshes.push(m);
  });
  if (meshes.length === 0) return;

  const positions: number[] = [];
  const indices: number[] = [];
  let vertOffset = 0;
  for (const m of meshes) {
    const g = m.geometry as THREE.BufferGeometry;
    const posAttr = g.getAttribute('position');
    if (!posAttr) continue;
    const arr = posAttr.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) positions.push(arr[i]);
    const index = g.getIndex();
    if (index) {
      const ia = index.array as ArrayLike<number>;
      for (let i = 0; i < ia.length; i++) indices.push(ia[i] + vertOffset);
    } else {
      for (let i = 0; i < posAttr.count; i++) indices.push(vertOffset + i);
    }
    vertOffset += posAttr.count;
  }
  if (indices.length < 3) return;

  const q = computeUprightQuaternion(positions, indices);
  if (Math.abs(q.w) > 0.99999) return; // identity → không đụng

  for (const m of meshes) {
    (m.geometry as THREE.BufferGeometry).applyQuaternion(q);
  }
}
