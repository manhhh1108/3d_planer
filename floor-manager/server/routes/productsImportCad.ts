import { Request, Response } from 'express';
import fs from 'fs';
import prisma from '../db.js';
import { isUniqueViolation } from '../prismaError.js';
import { ALLOWED_CAD_EXT, cadExtOf, storeUploadedAsset } from '../cad/storeAsset.js';

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

/**
 * Nhập một file CAD thành một sản phẩm. Mỗi request một file — trình duyệt gửi
 * vài file song song. Mã sản phẩm lấy từ tên file; mã đã tồn tại trong dự án thì
 * bỏ qua, không đụng gì tới sản phẩm cũ.
 */
export async function importCadHandler(req: Request, res: Response) {
  const file = req.file;
  /** Bỏ file tạm khi không dùng tới, tránh rác đọng lại trong storage/tmp. */
  const discard = () => {
    if (file) fs.rmSync(file.path, { force: true });
  };

  try {
    if (!file) return res.status(400).json({ error: 'file is required' });

    const projectId = String(req.body.projectId ?? '');
    if (!projectId) {
      discard();
      return res.status(400).json({ error: 'projectId is required' });
    }

    const ext = cadExtOf(file.originalname);
    if (!ALLOWED_CAD_EXT.includes(ext)) {
      discard();
      return res
        .status(400)
        .json({ error: `File type .${ext} not supported (${ALLOWED_CAD_EXT.join(', ')})` });
    }

    const code = deriveProductCode(file.originalname);
    if (!code) {
      discard();
      return res.status(400).json({ error: 'Không suy được mã sản phẩm từ tên file' });
    }

    // Kiểm dự án trước, để projectId sai trả 400 thay vì để FK ném ra 500.
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      discard();
      return res.status(400).json({ error: 'projectId không tồn tại' });
    }

    const existing = await prisma.product.findFirst({ where: { projectId, code } });
    if (existing) {
      discard();
      return res.json({ action: 'skipped', code, productId: existing.id });
    }

    // Tạo Product TRƯỚC Asset. Va chạm mã trùng phải xảy ra khi chưa sinh Asset
    // nào — làm ngược lại thì mỗi lần trùng để lại một asset mồ côi kèm file CAD
    // nằm chết trong sources/, không có gì dọn.
    let product;
    try {
      product = await prisma.product.create({
        data: { projectId, name: code, code, quantity: 1 },
      });
    } catch (err) {
      // Hai request cùng mã chạy song song: cả hai cùng vượt qua bước tra cứu ở
      // trên, ràng buộc duy nhất chặn cái thứ hai lại.
      if (isUniqueViolation(err)) {
        discard();
        const dup = await prisma.product.findFirst({ where: { projectId, code } });
        return res.json({ action: 'skipped', code, productId: dup?.id ?? null });
      }
      throw err;
    }

    try {
      // productId truyền thẳng vào: hàm chung gắn link rồi mới đẩy hàng đợi,
      // nếu không convert có thể xong trước lúc link kịp ghi.
      const asset = await storeUploadedAsset(file, ext, { productId: product.id });
      return res.status(201).json({
        action: 'created',
        code,
        productId: product.id,
        assetId: asset.id,
      });
    } catch (err) {
      // Lưu file hỏng sau khi đã tạo sản phẩm: xoá sản phẩm rỗng vừa tạo để lần
      // nhập sau chạy lại được từ đầu thay vì bị chính nó chặn vì trùng mã.
      await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
      throw err;
    }
  } catch (err) {
    discard();
    res.status(500).json({ error: String(err) });
  }
}
