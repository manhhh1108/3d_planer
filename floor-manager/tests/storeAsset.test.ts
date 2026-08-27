import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import prisma from '../server/db.js';
import { assetPaths } from '../server/cad/paths.js';
import { convertQueue } from '../server/cad/convertQueue.js';
import { cadExtOf, ALLOWED_CAD_EXT, storeUploadedAsset } from '../server/cad/storeAsset.js';
import { recoverStuckAssets } from '../server/cad/convert.js';

const FIXTURE_DXF = path.join(import.meta.dirname, 'fixtures', 'box.dxf');

/** Giả lập file multer vừa nhận: một file thật nằm trong thư mục tạm. */
function fakeUpload(originalname: string, content = '0\nEOF\n') {
  const tmp = path.join(os.tmpdir(), `up-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, content);
  return { originalname, path: tmp };
}

describe('cadExtOf', () => {
  it('lấy đuôi file viết thường, bỏ dấu chấm', () => {
    expect(cadExtOf('662-01.DWG')).toBe('dwg');
    expect(cadExtOf('a.dxf')).toBe('dxf');
    expect(cadExtOf('10022-01-DC 1.1.stp')).toBe('stp');
  });

  it('không có đuôi thì trả chuỗi rỗng', () => {
    expect(cadExtOf('khongcoduoi')).toBe('');
    expect(ALLOWED_CAD_EXT.includes('')).toBe(false);
  });
});

describe('storeUploadedAsset', () => {
  it('tạo asset pending, dời file gốc vào sources/, đẩy vào hàng đợi', async () => {
    const up = fakeUpload('block.dxf');
    const asset = await storeUploadedAsset(up, 'dxf');

    expect(asset.status).toBe('pending');
    expect(asset.fileName).toBe('block.dxf');
    expect(asset.fileType).toBe('dxf');

    const p = assetPaths(asset.id, 'dxf');
    expect(fs.existsSync(p.sourceFile!)).toBe(true);
    // file tạm đã được dời đi, không nhân bản
    expect(fs.existsSync(up.path)).toBe(false);

    await convertQueue.idle();
    const after = await prisma.asset.findUnique({ where: { id: asset.id } });
    // file rỗng nên convert hỏng — điều cần khẳng định là nó ĐÃ chạy,
    // tức là hàng đợi có nhận việc, chứ không đứng yên ở pending.
    expect(after!.status).toBe('failed');
  });

  it('IFC mặc định unitScale = 1, các định dạng khác = 0.001', async () => {
    const ifc = await storeUploadedAsset(fakeUpload('a.ifc'), 'ifc');
    const dxf = await storeUploadedAsset(fakeUpload('a.dxf'), 'dxf');
    expect(ifc.unitScale).toBe(1);
    expect(dxf.unitScale).toBe(0.001);
    await convertQueue.idle();
  });

  it('unitScale truyền vào thì được ưu tiên', async () => {
    const a = await storeUploadedAsset(fakeUpload('a.dxf'), 'dxf', { unitScale: 0.01 });
    expect(a.unitScale).toBe(0.01);
    await convertQueue.idle();
  });

  it('gắn sản phẩm XONG mới đẩy hàng đợi, nên convert cập nhật được sản phẩm', async () => {
    // Đây là bất biến dễ vỡ nhất của hàm này. Convert chạy nền và chỉ cập nhật
    // những Product đang trỏ tới asset; đẩy hàng đợi trước khi gắn link thì với
    // file DXF nhỏ, convert xong trước lúc link kịp ghi và sản phẩm không bao
    // giờ nhận được kích thước.
    //
    // Kiểm THỨ TỰ GỌI trực tiếp thay vì dựa vào đua thời gian: enqueue trước hay
    // sau product.update là chuyện tất định, còn "convert xong trước khi link
    // kịp ghi" thì tuỳ máy nhanh chậm nên không bắt được lỗi một cách tin cậy.
    const proj = await prisma.project.create({ data: { name: 'P' } });
    const product = await prisma.product.create({
      data: { projectId: proj.id, name: 'X', code: 'X-1', quantity: 1 },
    });
    const dxf = fakeUpload('box.dxf', fs.readFileSync(FIXTURE_DXF, 'utf8'));

    // Mock enqueue để ĐỌC trạng thái DB ngay tại thời điểm nó được gọi. Vì link
    // (product.update) được await trước enqueue, tại đây assetId của sản phẩm
    // phải đã khác null. Chuyển enqueue lên trước update thì lúc này assetId vẫn
    // null và test sập — bắt đúng lỗi thứ tự một cách tất định, không đua thời gian.
    // (spyOn prisma.product.update không dùng được: Prisma 7 gói model qua proxy.)
    let assetIdAtEnqueue: string | null | undefined = 'chưa gọi';
    let probe: Promise<unknown> = Promise.resolve();
    const enqueueSpy = vi.spyOn(convertQueue, 'enqueue').mockImplementation((_id: string) => {
      probe = prisma.product
        .findUnique({ where: { id: product.id } })
        .then((p) => {
          assetIdAtEnqueue = p?.assetId ?? null;
        });
    });

    try {
      const asset = await storeUploadedAsset(dxf, 'dxf', { productId: product.id });
      await probe;
      // Assert TRƯỚC khi restore: mockRestore xóa luôn lịch sử gọi của spy.
      expect(enqueueSpy).toHaveBeenCalledTimes(1);
      // Tại thời điểm enqueue, link đã ghi xong nên assetId khác null.
      expect(assetIdAtEnqueue).toBe(asset.id);
    } finally {
      enqueueSpy.mockRestore();
    }
  });
});

describe('recoverStuckAssets', () => {
  it('còn file gốc thì đưa về pending và trả id để chạy lại', async () => {
    const asset = await storeUploadedAsset(fakeUpload('lai.dxf'), 'dxf');
    await convertQueue.idle();
    // Giả lập server chết giữa chừng: bản ghi đang dở, file gốc vẫn còn
    await prisma.asset.update({
      where: { id: asset.id },
      data: { status: 'processing', error: null },
    });

    const retry = await recoverStuckAssets();

    expect(retry).toContain(asset.id);
    const after = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(after!.status).toBe('pending');
    expect(after!.error).toBeNull();
  });

  it('mất file gốc thì đánh failed và không chạy lại', async () => {
    const asset = await storeUploadedAsset(fakeUpload('mat.dxf'), 'dxf');
    await convertQueue.idle();
    await prisma.asset.update({ where: { id: asset.id }, data: { status: 'pending' } });
    fs.rmSync(assetPaths(asset.id, 'dxf').sourceDir, { recursive: true, force: true });

    const retry = await recoverStuckAssets();

    expect(retry).not.toContain(asset.id);
    const after = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(after!.status).toBe('failed');
    expect(after!.error).toBeTruthy();
  });

  it('không đụng tới asset đã xong hoặc đã hỏng', async () => {
    const done = await storeUploadedAsset(fakeUpload('xong.dxf'), 'dxf');
    await convertQueue.idle();
    await prisma.asset.update({ where: { id: done.id }, data: { status: 'ready', error: null } });

    const retry = await recoverStuckAssets();

    expect(retry).not.toContain(done.id);
    const after = await prisma.asset.findUnique({ where: { id: done.id } });
    expect(after!.status).toBe('ready');
  });
});
