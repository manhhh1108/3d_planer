/**
 * Giới hạn phóng to/thu nhỏ của canvas 2D.
 *
 * Sàn 1% chứ không phải 10%: bãi rộng vài trăm mét ở mức 10% vẫn tràn khỏi
 * màn hình, không nhìn được toàn cảnh để bố trí. Ở 1% thì 1 cm thật vẽ ra
 * 0,01 px, đủ để một mặt bằng cỡ 1 km lọt vào khung 1000 px.
 *
 * Vẽ ở mức thu nhỏ đó vẫn nhẹ: lưới tự tắt khi bước lưới dưới 4 px, thước kẻ
 * tự nhảy sang bậc chia lớn hơn — không có vòng lặp nào chạy theo số ô.
 */
export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 10;

/** Kẹp mức zoom vào [MIN_ZOOM, MAX_ZOOM]. Giá trị hỏng thì trả về 1. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
