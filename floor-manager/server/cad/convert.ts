import fs from 'fs';
import prisma from '../db.js';
import { assetPaths } from './paths.js';
import { meshesToFootprint, footprintToSvg, type Footprint, type CadMesh } from './geometry.js';
import { meshesToGlb } from './glb.js';
import { dxfToFootprint } from './convertDxf.js';
import { stepLengthScaleToMetre } from './units.js';
import { stepToMeshes } from './convertStep.js';
import { ifcToMeshes } from './convertIfc.js';
import { dwgToDxfText } from './convertDwg.js';

/** Chạy convert cho 1 asset: đọc source -> artifact -> update Asset + Products liên kết. */
export async function runConversion(assetId: string): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return;
  await prisma.asset.update({ where: { id: assetId }, data: { status: 'processing', error: null } });

  const p = assetPaths(assetId, asset.fileType);
  try {
    let footprint: Footprint;
    let glb: Uint8Array | null = null;
    // Hệ số quy đổi thực sự dùng (lưu lại vào Asset để phản ánh đúng đơn vị đã phát hiện).
    let resolvedUnitScale = asset.unitScale;
    // Override thủ công = unitScale khác giá trị mặc định 0.001 (UI hiện chưa expose).
    const override = asset.unitScale && asset.unitScale !== 0.001 ? asset.unitScale : null;

    if (asset.fileType === 'dxf' || asset.fileType === 'dwg') {
      const text =
        asset.fileType === 'dwg'
          ? await dwgToDxfText(p.sourceFile!)
          : fs.readFileSync(p.sourceFile!, 'utf8');
      // DXF: $INSUNITS trong file được ưu tiên trừ khi user override qua param.
      footprint = dxfToFootprint(text, override ?? undefined);
    } else {
      const buf = fs.readFileSync(p.sourceFile!);
      let meshes: CadMesh[];
      let upAxis: 'z' | 'y';
      let scale: number;
      if (asset.fileType === 'ifc') {
        meshes = await ifcToMeshes(buf);
        upAxis = 'y';
        // web-ifc đã quy hình học về MÉT theo đơn vị length của model -> không nhân thêm.
        scale = override ?? 1;
      } else {
        meshes = await stepToMeshes(buf);
        upAxis = 'z';
        // occt trả toạ độ theo ĐƠN VỊ GỐC -> đọc đơn vị length của STEP (fallback mm=0.001).
        // Bỏ qua detect với file quá lớn để tránh giữ cả file trong RAM dạng string.
        const detected =
          buf.length <= 80 * 1024 * 1024 ? stepLengthScaleToMetre(buf.toString('latin1')) : null;
        scale = override ?? detected ?? 0.001;
      }
      footprint = meshesToFootprint(meshes, scale, upAxis);
      glb = await meshesToGlb(meshes, scale, upAxis);
      resolvedUnitScale = scale;
    }

    fs.mkdirSync(p.artifactDir, { recursive: true });
    fs.writeFileSync(p.footprintFile, JSON.stringify(footprint));
    fs.writeFileSync(p.thumbFile, footprintToSvg(footprint, '#58a6ff'));
    if (glb) fs.writeFileSync(p.meshFile, glb);

    await prisma.asset.update({
      where: { id: assetId },
      data: {
        status: 'ready',
        error: null,
        unitScale: resolvedUnitScale,
        bboxLengthM: footprint.bbox.lengthM,
        bboxWidthM: footprint.bbox.widthM,
        bboxHeightM: footprint.bbox.heightM,
        areaM2: footprint.areaM2,
      },
    });

    // Cập nhật mọi product gắn asset này để app dùng ngay số liệu thật
    const products = await prisma.product.findMany({ where: { assetId } });
    for (const prod of products) {
      const meta = (prod.metadata as Record<string, unknown> | null) ?? {};
      // Ảnh do người dùng tự tải lên là lựa chọn cố ý — convert tự động không
      // được đè. Chỉ ghi khi chưa có ảnh, hoặc ảnh hiện tại cũng do CAD sinh.
      const keepThumb =
        prod.thumbnail != null && !prod.thumbnail.startsWith('/uploads/assets/');
      await prisma.product.update({
        where: { id: prod.id },
        data: {
          areaM2: footprint.areaM2,
          ...(keepThumb ? {} : { thumbnail: p.thumbUrl }),
          file3dUrl: glb ? p.meshUrl : prod.file3dUrl,
          metadata: {
            ...meta,
            widthM: footprint.bbox.lengthM,
            depthM: footprint.bbox.widthM,
            heightM: footprint.bbox.heightM || (meta.heightM as number | undefined) || 0.5,
          },
        },
      });
    }
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    await prisma.asset.update({
      where: { id: assetId },
      data: { status: 'failed', error: message },
    });
  }
}

/**
 * Boot recovery cho job convert đang dở khi server chết.
 *
 * File CAD gốc không bao giờ bị xoá và convert đọc lại từ đó mỗi lần chạy, nên
 * job dở dang chạy lại được và cho kết quả y hệt. Trước đây hàm này đánh hỏng cả
 * lô và bắt upload lại — với một lô nhập 50 file thì một lần restart là mất sạch.
 *
 * Trả về danh sách asset cần đưa lại vào hàng đợi. Việc enqueue để cho
 * `server/index.ts` làm, nhờ vậy file này không phải import ngược module hàng đợi.
 */
export async function recoverStuckAssets(): Promise<string[]> {
  const stuck = await prisma.asset.findMany({
    where: { status: { in: ['pending', 'processing'] } },
    select: { id: true, fileType: true },
  });

  const retry: string[] = [];
  for (const a of stuck) {
    const p = assetPaths(a.id, a.fileType);
    if (p.sourceFile && fs.existsSync(p.sourceFile)) {
      await prisma.asset.update({
        where: { id: a.id },
        data: { status: 'pending', error: null },
      });
      retry.push(a.id);
    } else {
      await prisma.asset.update({
        where: { id: a.id },
        data: { status: 'failed', error: 'Mất file gốc khi server khởi động lại — upload lại file' },
      });
    }
  }
  return retry;
}
