/**
 * Seed demo data cho Floor Manager — tạo đầy đủ luồng Phase 1→5.
 *
 * Chạy: cd floor-manager && npx tsx prisma/seed-demo.ts
 *
 * Dữ liệu tạo:
 * - 1 Admin user (admin@demo.com / admin123)
 * - 1 Site "Nhà máy VHE1" với 1 Layout "Xưởng chính"
 * - 1 Site "Kho bãi KCN" với 1 Layout "Bãi lắp ráp"
 * - 2 Projects: "Đơn hàng 10020" (2 SP), "Đơn hàng 10AY" (3 SP)
 * - Upload CAD files (STP/IFC) cho các sản phẩm
 * - Tạo snapshots (thực tế) trên các layout
 * - Tạo Plans (kế hoạch) với PlanItems + xung đột để demo
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const FILE_TEST = path.resolve(import.meta.dirname, '../../file_test');

async function main() {
  console.log('=== Seed Demo Data ===\n');

  // --- Phase 1: User ---
  const hash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: { email: 'admin@demo.com', name: 'Admin', role: 'ADMIN', passwordHash: hash },
  });
  console.log(`[Phase 1] User: ${admin.email}`);

  // --- Phase 1: Sites ---
  const site1 = await prisma.site.create({
    data: { name: 'Nhà máy VHE1', address: 'KCN Đình Vũ, Hải Phòng' },
  });
  const site2 = await prisma.site.create({
    data: { name: 'Kho bãi KCN', address: 'KCN Nomura, Hải Phòng' },
  });
  console.log(`[Phase 1] Sites: ${site1.name}, ${site2.name}`);

  // --- Phase 1: Layouts ---
  const layout1 = await prisma.layout.create({
    data: { siteId: site1.id, name: 'Xưởng chính', widthM: 120, heightM: 60 },
  });
  const layout2 = await prisma.layout.create({
    data: { siteId: site2.id, name: 'Bãi lắp ráp', widthM: 80, heightM: 40 },
  });
  console.log(`[Phase 1] Layouts: ${layout1.name} (${layout1.widthM}x${layout1.heightM}m), ${layout2.name} (${layout2.widthM}x${layout2.heightM}m)`);

  // --- Phase 1: Projects ---
  const proj1 = await prisma.project.create({
    data: { name: 'Đơn hàng 10020', description: 'Kết cấu thép nhà máy ABC' },
  });
  const proj2 = await prisma.project.create({
    data: { name: 'Đơn hàng 10AY', description: 'Module thiết bị XYZ' },
  });
  console.log(`[Phase 1] Projects: ${proj1.name}, ${proj2.name}`);

  // --- Phase 1: Products ---
  const products = await Promise.all([
    prisma.product.create({
      data: {
        projectId: proj1.id,
        name: 'Dầm chính ST4',
        code: '10020-07',
        processStage: 'Hàn',
        weightKg: 8500,
        areaM2: 24,
        color: '#f59e0b',
        metadata: { widthM: 6, depthM: 4, heightM: 2.5 },
      },
    }),
    prisma.product.create({
      data: {
        projectId: proj1.id,
        name: 'Cụm HDA01',
        code: '10022-11',
        processStage: 'Lắp ráp',
        weightKg: 12000,
        areaM2: 35,
        color: '#3b82f6',
        metadata: { widthM: 7, depthM: 5, heightM: 3 },
      },
    }),
    prisma.product.create({
      data: {
        projectId: proj2.id,
        name: 'Module AY-241',
        code: '10AY-241',
        processStage: 'Sơn',
        weightKg: 3200,
        areaM2: 12,
        color: '#22c55e',
        metadata: { widthM: 4, depthM: 3, heightM: 2 },
      },
    }),
    prisma.product.create({
      data: {
        projectId: proj2.id,
        name: 'Module AY-243',
        code: '10AY-243',
        processStage: 'Cắt',
        weightKg: 2800,
        areaM2: 10,
        color: '#ef4444',
        metadata: { widthM: 3.5, depthM: 3, heightM: 1.8 },
      },
    }),
    prisma.product.create({
      data: {
        projectId: proj2.id,
        name: 'Module AY-261',
        code: '10AY-261',
        processStage: 'Hàn',
        weightKg: 4500,
        areaM2: 15,
        color: '#f59e0b',
        metadata: { widthM: 5, depthM: 3, heightM: 2.2 },
      },
    }),
  ]);
  console.log(`[Phase 1] Products: ${products.map(p => p.code).join(', ')}`);

  // --- Phase 2: Upload CAD files ---
  // Tạo assets cho các file có sẵn
  const cadFiles: { product: typeof products[0]; file: string; type: string }[] = [
    { product: products[0], file: '10020-07-ST4-7+8.ifc', type: 'ifc' },
    { product: products[1], file: '10022-11-HDA01.ifc', type: 'ifc' },
    { product: products[2], file: '10AY15241.stp', type: 'stp' },
    { product: products[3], file: '10AY15243.stp', type: 'stp' },
    { product: products[4], file: '10AY15261.stp', type: 'stp' },
  ];

  for (const { product, file, type } of cadFiles) {
    const filePath = path.join(FILE_TEST, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  [Phase 2] SKIP ${file} (không tìm thấy)`);
      continue;
    }

    const asset = await prisma.asset.create({
      data: {
        fileName: file,
        fileType: type,
        status: 'pending',
        unitScale: 0.001,
      },
    });

    // Link asset to product
    await prisma.product.update({
      where: { id: product.id },
      data: { assetId: asset.id },
    });

    // Copy source file to storage
    const sourceDir = path.resolve('./storage/sources', asset.id);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.copyFileSync(filePath, path.join(sourceDir, `source.${type}`));

    console.log(`  [Phase 2] CAD: ${product.code} ← ${file} (asset ${asset.id}, pending)`);
  }
  console.log(`[Phase 2] CAD files linked. Chạy server để tự động convert.`);

  // --- Phase 1: Snapshots (thực tế đặt trên mặt bằng) ---
  // Snapshot 1: ngày 1/8 — 3 SP trên xưởng chính
  await prisma.snapshot.create({
    data: {
      layoutId: layout1.id,
      date: new Date('2026-08-01'),
      note: 'Bố trí đầu tháng 8',
      createdBy: admin.email,
      positions: {
        create: [
          { productId: products[0].id, x: 15, y: 15, rotation: 0 },
          { productId: products[1].id, x: 40, y: 20, rotation: 0 },
          { productId: products[2].id, x: 70, y: 15, rotation: 0 },
        ],
      },
    },
  });

  // Snapshot 2: ngày 10/8 — thêm 1 SP, di chuyển 1 SP
  await prisma.snapshot.create({
    data: {
      layoutId: layout1.id,
      date: new Date('2026-08-10'),
      note: 'Cập nhật giữa tháng 8',
      createdBy: admin.email,
      positions: {
        create: [
          { productId: products[0].id, x: 15, y: 15, rotation: 0 },
          { productId: products[1].id, x: 45, y: 25, rotation: 90 },
          { productId: products[2].id, x: 70, y: 15, rotation: 0 },
          { productId: products[3].id, x: 95, y: 15, rotation: 0 },
        ],
      },
    },
  });

  // Snapshot 3: bãi lắp ráp — 2 SP
  await prisma.snapshot.create({
    data: {
      layoutId: layout2.id,
      date: new Date('2026-08-12'),
      note: 'Chuyển module ra bãi',
      createdBy: admin.email,
      positions: {
        create: [
          { productId: products[4].id, x: 10, y: 10, rotation: 0 },
          { productId: products[3].id, x: 30, y: 10, rotation: 0 },
        ],
      },
    },
  });

  console.log(`[Phase 1] Snapshots: 2 trên "${layout1.name}", 1 trên "${layout2.name}"`);

  // --- Phase 5: Plans (kế hoạch) ---
  const plan1 = await prisma.plan.create({
    data: { layoutId: layout1.id, name: 'Plan tháng 9' },
  });
  const plan2 = await prisma.plan.create({
    data: { layoutId: layout1.id, name: 'Plan phương án B' },
  });
  const plan3 = await prisma.plan.create({
    data: { layoutId: layout2.id, name: 'Plan bãi T9' },
  });

  // Plan items cho plan1 — có xung đột cố ý
  await prisma.planItem.createMany({
    data: [
      // Dầm chính: 1/9 → 20/9 tại (15, 15)
      { planId: plan1.id, productId: products[0].id, x: 15, y: 15, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-20') },
      // Cụm HDA01: 10/9 → 30/9 tại (40, 20)
      { planId: plan1.id, productId: products[1].id, x: 40, y: 20, startDate: new Date('2026-09-10'), endDate: new Date('2026-09-30') },
      // Module AY-241: 5/9 → 25/9 tại (70, 15)
      { planId: plan1.id, productId: products[2].id, x: 70, y: 15, startDate: new Date('2026-09-05'), endDate: new Date('2026-09-25') },
      // Module AY-243: 15/9 → 10/10 tại (15, 15) — XUNG ĐỘT với dầm chính!
      { planId: plan1.id, productId: products[3].id, x: 15, y: 15, startDate: new Date('2026-09-15'), endDate: new Date('2026-10-10') },
      // Module AY-261: 1/10 → 20/10 tại (40, 20) — không xung đột (sau HDA01)
      { planId: plan1.id, productId: products[4].id, x: 40, y: 20, startDate: new Date('2026-10-01'), endDate: new Date('2026-10-20') },
    ],
  });

  // Plan items cho plan3 (bãi lắp ráp)
  await prisma.planItem.createMany({
    data: [
      { planId: plan3.id, productId: products[4].id, x: 10, y: 10, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-15') },
      { planId: plan3.id, productId: products[3].id, x: 30, y: 10, startDate: new Date('2026-09-10'), endDate: new Date('2026-09-30') },
    ],
  });

  console.log(`[Phase 5] Plans: "${plan1.name}" (5 items, có xung đột), "${plan2.name}" (trống), "${plan3.name}" (2 items)`);

  // --- Tổng kết ---
  console.log('\n=== Seed hoàn tất ===');
  console.log(`Login: admin@demo.com / admin123`);
  console.log(`\nLuồng test:`);
  console.log(`1. Dashboard: Trang chủ → xem tổng quan (4 cards, tỷ lệ lấp đầy, công đoạn, hoạt động)`);
  console.log(`2. Site/Layout: Click "Nhà máy VHE1" → xem layout "Xưởng chính"`);
  console.log(`3. Products: Click "Đơn hàng 10020" → xem sản phẩm, CAD status`);
  console.log(`4. Editor (Bố trí): Click layout → editor 2D, chọn ngày trên timeline xem snapshot`);
  console.log(`5. Editor (Kế hoạch): Tab "Kế hoạch" → chọn "Plan tháng 9" → Gantt chart + xung đột`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
