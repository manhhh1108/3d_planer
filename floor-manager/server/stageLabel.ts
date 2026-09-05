import prisma from './db.js';

/**
 * Tên công đoạn để gộp số liệu báo cáo.
 *
 * Có hai nguồn: `Position.stageId` (công đoạn do VÙNG trên mặt bằng gán khi đặt
 * sản phẩm — nguồn chính từ khi có vùng làm việc) và `Product.processStage`
 * (chuỗi tự do khai lúc nhập sản phẩm — nguồn cũ). Ưu tiên stageId; dữ liệu cũ
 * chưa có stageId thì vẫn gộp theo processStage để báo cáo không mất số.
 */

/** id công đoạn -> tên. Lấy cả công đoạn đã tắt vì snapshot cũ còn trỏ tới. */
export async function stageNamesById(): Promise<Map<string, string>> {
  const stages = await prisma.stage.findMany({ select: { id: true, name: true } });
  return new Map(stages.map((s) => [s.id, s.name]));
}

export function resolveStageName(
  pos: { stageId?: string | null; product: { processStage?: string | null } },
  names: Map<string, string>,
  fallback: string,
): string {
  const fromZone = pos.stageId ? names.get(pos.stageId) : undefined;
  return fromZone ?? pos.product.processStage ?? fallback;
}
