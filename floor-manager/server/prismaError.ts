/**
 * Prisma báo đụng ràng buộc duy nhất bằng mã lỗi P2002. Kiểm theo mã chứ không
 * theo lớp lỗi, vì Prisma 7 gói lỗi qua nhiều tầng và `instanceof` không ổn định
 * khi client được generate lại.
 */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
