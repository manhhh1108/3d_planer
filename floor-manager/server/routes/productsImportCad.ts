/**
 * Mã sản phẩm suy từ tên file CAD: bỏ đường dẫn, bỏ đuôi, cắt khoảng trắng.
 * `662-01.dwg` -> `662-01`.
 *
 * Chỉ bỏ đuôi cuối cùng, vì tên bản vẽ hay có dạng `10022-01-DC 1.1.stp` mà
 * phần `1.1` là số hiệu, không phải đuôi file.
 */
export function deriveProductCode(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '');
  return base.replace(/\.[^.]+$/, '').trim();
}
