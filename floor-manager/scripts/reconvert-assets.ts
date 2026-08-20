/**
 * Re-convert lại tất cả Asset (STEP/IFC/DXF/DWG) với logic đơn vị mới.
 * Dùng sau khi sửa detect đơn vị: `npx tsx scripts/reconvert-assets.ts`
 */
import prisma from '../server/db.js';
import { runConversion } from '../server/cad/convert.js';

async function main() {
  const assets = await prisma.asset.findMany({ select: { id: true, fileName: true, fileType: true } });
  console.log(`Re-converting ${assets.length} assets...`);
  let ok = 0, fail = 0;
  for (const a of assets) {
    try {
      await runConversion(a.id);
      const updated = await prisma.asset.findUnique({
        where: { id: a.id },
        select: { status: true, unitScale: true, bboxLengthM: true, bboxWidthM: true, error: true },
      });
      if (updated?.status === 'ready') {
        ok++;
        console.log(`  ✓ ${a.fileType} ${a.fileName} → scale=${updated.unitScale} bbox=${updated.bboxLengthM}×${updated.bboxWidthM}m`);
      } else {
        fail++;
        console.log(`  ✗ ${a.fileType} ${a.fileName} → ${updated?.status} ${updated?.error ?? ''}`);
      }
    } catch (e) {
      fail++;
      console.log(`  ✗ ${a.fileType} ${a.fileName} → ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Done: ${ok} ready, ${fail} failed.`);
  await prisma.$disconnect();
  process.exit(0);
}

main();
