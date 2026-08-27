import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../db.js';
import { assetPaths } from './paths.js';
import { convertQueue } from './convertQueue.js';

export const ALLOWED_CAD_EXT = ['dwg', 'dxf', 'step', 'stp', 'ifc'];

const TMP_DIR = path.resolve(process.env.STORAGE_DIR || './storage', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

/** Middleware multer dùng chung cho mọi endpoint nhận file CAD. */
export const cadUpload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 200 * 1024 * 1024 },
});

/** Đuôi file viết thường, không có dấu chấm. Không có đuôi thì trả chuỗi rỗng. */
export function cadExtOf(fileName: string): string {
  return path.extname(fileName).toLowerCase().replace('.', '');
}

/**
 * Dời file từ `src` sang `dest`. Ưu tiên `rename` (nhanh, nguyên tử), nhưng nếu
 * thư mục tạm và `sources/` nằm khác ổ đĩa/mount thì `rename` ném `EXDEV` — khi
 * đó chép rồi xoá bản gốc. Kết thúc file tạm luôn không còn, đúng ngữ nghĩa dời.
 */
function moveFile(src: string, dest: string) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if ((err as { code?: string }).code !== 'EXDEV') throw err;
    fs.copyFileSync(src, dest);
    fs.rmSync(src, { force: true });
  }
}

/**
 * Biến file vừa upload thành một `Asset`: tạo bản ghi, dời file từ thư mục tạm
 * sang `storage/sources/<assetId>/`, gắn vào sản phẩm nếu có, rồi mới đẩy vào
 * hàng đợi convert.
 *
 * Dùng chung cho upload lẻ (`POST /assets`) và nhập hàng loạt
 * (`POST /products/import-cad`) để hai đường không lệch nhau.
 *
 * `productId` nằm trong hàm này chứ không để người gọi tự gắn sau, vì thứ tự
 * "gắn link xong mới enqueue" là bất biến bắt buộc: convert chạy nền và chỉ cập
 * nhật những Product đang trỏ tới asset. Enqueue trước thì với file DXF nhỏ,
 * convert xong trước lúc link kịp ghi và sản phẩm không bao giờ nhận được kích
 * thước, diện tích hay ảnh.
 *
 * Người gọi phải kiểm `ext` nằm trong `ALLOWED_CAD_EXT` trước.
 */
export async function storeUploadedAsset(
  file: { originalname: string; path: string },
  ext: string,
  opts: { unitScale?: number; productId?: string } = {},
) {
  const asset = await prisma.asset.create({
    data: {
      fileName: file.originalname,
      fileType: ext,
      unitScale: opts.unitScale ?? (ext === 'ifc' ? 1 : 0.001),
    },
  });
  const p = assetPaths(asset.id, ext);
  fs.mkdirSync(p.sourceDir, { recursive: true });
  moveFile(file.path, p.sourceFile!);

  if (opts.productId) {
    await prisma.product.update({
      where: { id: opts.productId },
      data: { assetId: asset.id },
    });
  }

  convertQueue.enqueue(asset.id); // phải là bước CUỐI, xem ghi chú ở trên
  return asset;
}
