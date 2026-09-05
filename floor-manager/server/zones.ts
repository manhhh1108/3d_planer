/**
 * Vùng làm việc lưu trong `Snapshot.zones` (JSON, toạ độ MÉT — editor giữ cm
 * rồi quy đổi khi lưu, xem `zoneToApiZone` bên web).
 *
 * Diện tích một mặt bằng là TỔNG diện tích các vùng đã đánh dấu, không phải
 * `widthM × heightM`: khung bao gồm cả lối đi, cột, khu vực không được phép đặt
 * sản phẩm, nên lấy khung làm mẫu số thì tỉ lệ lấp đầy luôn thấp giả tạo.
 */
export interface StoredZone {
  id: string;
  name?: string | null;
  points: Array<{ x: number; y: number }>;
  allowedStageIds?: string[];
}

/** Diện tích đa giác (shoelace), trị tuyệt đối nên không phụ thuộc chiều quay. */
export function polygonAreaM2(points: Array<{ x: number; y: number }>): number {
  const n = points.length;
  if (n < 3) return 0;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Lọc ra các vùng hợp lệ từ giá trị JSON thô của cột `zones`. */
export function parseZones(zones: unknown): StoredZone[] {
  if (!Array.isArray(zones)) return [];
  return zones.filter(
    (z): z is StoredZone =>
      !!z &&
      typeof z === 'object' &&
      Array.isArray((z as StoredZone).points) &&
      (z as StoredZone).points.length >= 3 &&
      (z as StoredZone).points.every(
        (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y),
      ),
  );
}

/**
 * Tổng diện tích các vùng (m²). Trả 0 khi mặt bằng chưa vẽ vùng nào — người gọi
 * tự quyết định thoái lui về khung bao, xem `layoutAreaM2`.
 */
export function zonesAreaM2(zones: unknown): number {
  return parseZones(zones).reduce((sum, z) => sum + polygonAreaM2(z.points), 0);
}

/**
 * Diện tích dùng làm MẪU SỐ khi tính tỉ lệ lấp đầy của một mặt bằng.
 * Có vùng thì lấy tổng diện tích vùng; chưa vẽ vùng nào thì thoái lui về khung
 * bao `widthM × heightM` để mặt bằng cũ vẫn ra số như trước.
 */
export function layoutAreaM2(
  zones: unknown,
  layout: { widthM: number; heightM: number },
): number {
  const fromZones = zonesAreaM2(zones);
  return fromZones > 0 ? fromZones : layout.widthM * layout.heightM;
}
