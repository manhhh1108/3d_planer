import type { FurnitureItem } from '$lib/models/types';

/**
 * Màu hiển thị của một block, dùng chung cho canvas 2D và viewer 3D.
 *
 * Ưu tiên: màu CÔNG ĐOẠN (do vùng gán khi đặt sản phẩm) > màu riêng người dùng
 * đặt cho block > màu mặc định của danh mục. Công đoạn thắng vì mục đích của
 * vùng là nhìn mặt bằng biết ngay chỗ nào đang làm việc gì.
 *
 * `stageColorOf` truyền vào để hàm không phụ thuộc store — 2D và 3D cùng gọi
 * `stageColor` từ $lib/stores/stages, test truyền bảng tra giả.
 */
export function blockColor(
  item: Pick<FurnitureItem, 'stageId' | 'color'>,
  catalogColor: string,
  stageColorOf: (id: string | undefined) => string | undefined,
): string {
  return stageColorOf(item.stageId) ?? item.color ?? catalogColor;
}
