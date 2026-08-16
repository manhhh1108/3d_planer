/**
 * Seed demo data đầy đủ cho Floor Manager
 *
 * Chạy: cd floor-manager && npx tsx prisma/seed-demo.ts
 *
 * Tạo:
 * - 5 users (admin, 2 planning, 1 viewer, 1 pending)
 * - 2 sites, 3 layouts (1 có nền DXF)
 * - 3 projects, 8 products (gắn CAD files IFC/STP)
 * - Snapshots thực tế cho mỗi layout (nhiều ngày)
 * - Plans + PlanItems + xung đột
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
  // --- Clean ---
  console.log('Xóa dữ liệu cũ...');
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "plan_items","plans","positions","snapshots","layouts","sites","products","projects","assets","users" CASCADE'
  );

  const hash = await bcrypt.hash('123456', 12);

  // ============================================================
  // USERS — 5 tài khoản, 4 roles
  // ============================================================
  const [admin, planner1, planner2, viewer, pending] = await Promise.all([
    prisma.user.create({ data: { email: 'admin@vhe.com', name: 'Nguyễn Văn Admin', role: 'ADMIN', passwordHash: hash } }),
    prisma.user.create({ data: { email: 'kehoach1@vhe.com', name: 'Trần Thị Kế Hoạch', role: 'PLANNING', passwordHash: hash } }),
    prisma.user.create({ data: { email: 'kehoach2@vhe.com', name: 'Lê Văn Lịch', role: 'PLANNING', passwordHash: hash } }),
    prisma.user.create({ data: { email: 'viewer@vhe.com', name: 'Phạm Văn Xem', role: 'VIEWER', passwordHash: hash } }),
    prisma.user.create({ data: { email: 'moi@vhe.com', name: 'Nguyễn Mới Đăng Ký', role: 'PENDING', passwordHash: hash } }),
  ]);
  console.log(`[Users] 5 tài khoản — mật khẩu chung: 123456`);
  console.log(`  ADMIN:    admin@vhe.com`);
  console.log(`  PLANNING: kehoach1@vhe.com, kehoach2@vhe.com`);
  console.log(`  VIEWER:   viewer@vhe.com`);
  console.log(`  PENDING:  moi@vhe.com`);

  // ============================================================
  // SITES + LAYOUTS
  // ============================================================
  const site1 = await prisma.site.create({
    data: { name: 'Nhà máy VHE1', address: 'KCN Đình Vũ, Hải Phòng' },
  });
  const site2 = await prisma.site.create({
    data: { name: 'Kho bãi Nomura', address: 'KCN Nomura, Hải Phòng' },
  });

  // Layout 1: Xưởng chính — upload nền DXF
  const layout1 = await prisma.layout.create({
    data: { siteId: site1.id, name: 'Xưởng hàn & sơn', widthM: 120, heightM: 60 },
  });
  const layout2 = await prisma.layout.create({
    data: { siteId: site1.id, name: 'Xưởng lắp ráp', widthM: 80, heightM: 40 },
  });
  const layout3 = await prisma.layout.create({
    data: { siteId: site2.id, name: 'Bãi chứa ngoài trời', widthM: 150, heightM: 80 },
  });
  console.log(`[Sites] ${site1.name} (2 layout), ${site2.name} (1 layout)`);

  // Upload nền DXF cho layout1
  const dxfFile = path.join(FILE_TEST, 'LAYOUT VHE1 10-9.dxf');
  if (fs.existsSync(dxfFile)) {
    try {
      const { dxfToSvg } = await import('../server/cad/convertDxfSvg.js');
      const { layoutBgPaths } = await import('../server/cad/paths.js');
      const dxfText = fs.readFileSync(dxfFile, 'utf8');
      const { svg, widthM, heightM } = dxfToSvg(dxfText);
      const p = layoutBgPaths(layout1.id);
      fs.mkdirSync(p.sourceDir, { recursive: true });
      fs.mkdirSync(p.artifactDir, { recursive: true });
      fs.copyFileSync(dxfFile, p.sourceFile('dxf'));
      fs.writeFileSync(p.bgFile, svg, 'utf8');
      await prisma.layout.update({
        where: { id: layout1.id },
        data: { backgroundFile: p.bgUrl, widthM, heightM },
      });
      console.log(`  → Nền DXF cho "${layout1.name}" (${widthM.toFixed(1)}x${heightM.toFixed(1)}m)`);
    } catch (e) {
      console.log(`  → Lỗi upload nền: ${e}`);
    }
  }

  // ============================================================
  // PROJECTS + PRODUCTS
  // ============================================================
  const proj1 = await prisma.project.create({
    data: { name: 'ĐH-10020 Kết cấu thép ABC', description: 'Kết cấu thép nhà máy ABC — 3 block chính' },
  });
  const proj2 = await prisma.project.create({
    data: { name: 'ĐH-10AY Module XYZ', description: 'Module thiết bị công nghệ XYZ — 3 module' },
  });
  const proj3 = await prisma.project.create({
    data: { name: 'ĐH-10022 Cụm chi tiết', description: 'Cụm chi tiết máy — 2 cụm' },
  });

  const products = await Promise.all([
    // Proj1: 3 sản phẩm
    prisma.product.create({ data: {
      projectId: proj1.id, name: 'Dầm chính ST4-7+8', code: '10020-07',
      processStage: 'Hàn', weightKg: 8500, areaM2: 24, color: '#f59e0b',
      metadata: { widthM: 6, depthM: 4, heightM: 2.5 },
    }}),
    prisma.product.create({ data: {
      projectId: proj1.id, name: 'Cột FR01', code: '10020-FR01',
      processStage: 'Sơn', weightKg: 5200, areaM2: 15, color: '#22c55e',
      metadata: { widthM: 3, depthM: 3, heightM: 8 },
    }}),
    prisma.product.create({ data: {
      projectId: proj1.id, name: 'Giằng GR02', code: '10020-GR02',
      processStage: 'Cắt', weightKg: 2100, areaM2: 8, color: '#ef4444',
      metadata: { widthM: 2, depthM: 4, heightM: 0.5 },
    }}),
    // Proj2: 3 module
    prisma.product.create({ data: {
      projectId: proj2.id, name: 'Module AY-241', code: '10AY-241',
      processStage: 'Lắp ráp', weightKg: 3200, areaM2: 12, color: '#3b82f6',
      metadata: { widthM: 4, depthM: 3, heightM: 2 },
    }}),
    prisma.product.create({ data: {
      projectId: proj2.id, name: 'Module AY-243', code: '10AY-243',
      processStage: 'Hàn', weightKg: 2800, areaM2: 10, color: '#f59e0b',
      metadata: { widthM: 3.5, depthM: 3, heightM: 1.8 },
    }}),
    prisma.product.create({ data: {
      projectId: proj2.id, name: 'Module AY-261', code: '10AY-261',
      processStage: 'Sơn', weightKg: 4500, areaM2: 15, color: '#22c55e',
      metadata: { widthM: 5, depthM: 3, heightM: 2.2 },
    }}),
    // Proj3: 2 cụm
    prisma.product.create({ data: {
      projectId: proj3.id, name: 'Cụm HDA01', code: '10022-11',
      processStage: 'Lắp ráp', weightKg: 12000, areaM2: 35, color: '#3b82f6',
      metadata: { widthM: 7, depthM: 5, heightM: 3 },
    }}),
    prisma.product.create({ data: {
      projectId: proj3.id, name: 'Cụm DC 1.1', code: '10022-01',
      processStage: 'Hàn', weightKg: 6800, areaM2: 18, color: '#f59e0b',
      metadata: { widthM: 4.5, depthM: 4, heightM: 2.5 },
    }}),
  ]);
  console.log(`[Projects] ${proj1.name} (3 SP), ${proj2.name} (3 SP), ${proj3.name} (2 SP)`);

  // ============================================================
  // CAD FILES — link IFC/STP vào products
  // ============================================================
  const cadMap: [number, string, string][] = [
    [0, '10020-07-ST4-7+8.ifc', 'ifc'],
    [3, '10AY15241.stp', 'stp'],
    [4, '10AY15243.stp', 'stp'],
    [5, '10AY15261.stp', 'stp'],
    [6, '10022-11-HDA01.ifc', 'ifc'],
    [7, '10022-01-DC 1.1.stp', 'stp'],
  ];

  let cadCount = 0;
  for (const [idx, file, type] of cadMap) {
    const filePath = path.join(FILE_TEST, file);
    if (!fs.existsSync(filePath)) continue;

    const asset = await prisma.asset.create({
      data: { fileName: file, fileType: type, status: 'pending', unitScale: 0.001 },
    });
    await prisma.product.update({
      where: { id: products[idx].id },
      data: { assetId: asset.id },
    });

    const sourceDir = path.resolve('./storage/sources', asset.id);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.copyFileSync(filePath, path.join(sourceDir, `source.${type}`));
    cadCount++;
  }
  console.log(`[CAD] ${cadCount} files linked (pending convert)`);

  // Convert CAD
  console.log('[CAD] Converting...');
  try {
    const { runConversion } = await import('../server/cad/convert.js');
    const assets = await prisma.asset.findMany({ where: { status: 'pending' } });
    for (const a of assets) {
      try {
        await runConversion(a.id);
        console.log(`  ✓ ${a.fileName}`);
      } catch (e) {
        console.log(`  ✗ ${a.fileName}: ${e}`);
      }
    }
  } catch {
    console.log('  → Convert module not available, skip');
  }

  // ============================================================
  // SNAPSHOTS — thực tế trên mặt bằng
  // ============================================================
  // Layout 1 (Xưởng hàn & sơn): 3 snapshots
  await prisma.snapshot.create({ data: {
    layoutId: layout1.id, date: new Date('2026-08-01'), note: 'Đầu tháng 8 — bắt đầu dự án 10020',
    createdBy: planner1.email,
    positions: { create: [
      { productId: products[0].id, x: 15, y: 15 },
      { productId: products[1].id, x: 40, y: 15 },
    ]},
  }});
  await prisma.snapshot.create({ data: {
    layoutId: layout1.id, date: new Date('2026-08-08'), note: 'Tuần 2 — thêm giằng + module',
    createdBy: planner1.email,
    positions: { create: [
      { productId: products[0].id, x: 15, y: 15 },
      { productId: products[1].id, x: 40, y: 15 },
      { productId: products[2].id, x: 65, y: 15 },
      { productId: products[3].id, x: 15, y: 35 },
    ]},
  }});
  await prisma.snapshot.create({ data: {
    layoutId: layout1.id, date: new Date('2026-08-15'), note: 'Giữa tháng 8 — di chuyển cột, thêm cụm',
    createdBy: planner2.email,
    positions: { create: [
      { productId: products[0].id, x: 15, y: 15 },
      { productId: products[1].id, x: 45, y: 20, rotation: 90 },
      { productId: products[2].id, x: 65, y: 15 },
      { productId: products[3].id, x: 15, y: 35 },
      { productId: products[6].id, x: 85, y: 25 },
    ]},
  }});

  // Layout 2 (Xưởng lắp ráp): 2 snapshots
  await prisma.snapshot.create({ data: {
    layoutId: layout2.id, date: new Date('2026-08-10'), note: 'Bắt đầu lắp ráp module',
    createdBy: planner1.email,
    positions: { create: [
      { productId: products[4].id, x: 10, y: 10 },
      { productId: products[5].id, x: 35, y: 10 },
    ]},
  }});
  await prisma.snapshot.create({ data: {
    layoutId: layout2.id, date: new Date('2026-08-14'), note: 'Thêm cụm DC',
    createdBy: planner2.email,
    positions: { create: [
      { productId: products[4].id, x: 10, y: 10 },
      { productId: products[5].id, x: 35, y: 10 },
      { productId: products[7].id, x: 60, y: 10 },
    ]},
  }});

  // Layout 3 (Bãi chứa): 1 snapshot
  await prisma.snapshot.create({ data: {
    layoutId: layout3.id, date: new Date('2026-08-12'), note: 'Chuyển hàng ra bãi',
    createdBy: planner1.email,
    positions: { create: [
      { productId: products[1].id, x: 20, y: 20 },
      { productId: products[5].id, x: 50, y: 20 },
    ]},
  }});

  console.log(`[Snapshots] 3 trên "${layout1.name}", 2 trên "${layout2.name}", 1 trên "${layout3.name}"`);

  // ============================================================
  // PLANS + PLANITEMS
  // ============================================================
  // Plan 1: Xưởng hàn — tháng 9 (có xung đột)
  const plan1 = await prisma.plan.create({ data: { layoutId: layout1.id, name: 'KH tháng 9 — Xưởng hàn' } });
  await prisma.planItem.createMany({ data: [
    { planId: plan1.id, productId: products[0].id, x: 15, y: 15, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-20') },
    { planId: plan1.id, productId: products[1].id, x: 40, y: 15, startDate: new Date('2026-09-05'), endDate: new Date('2026-09-25') },
    { planId: plan1.id, productId: products[2].id, x: 65, y: 15, startDate: new Date('2026-09-10'), endDate: new Date('2026-09-30') },
    // XUNG ĐỘT: cùng vị trí (15,15) chồng thời gian với products[0]
    { planId: plan1.id, productId: products[4].id, x: 15, y: 15, startDate: new Date('2026-09-15'), endDate: new Date('2026-10-10') },
    { planId: plan1.id, productId: products[6].id, x: 85, y: 25, startDate: new Date('2026-09-20'), endDate: new Date('2026-10-15') },
  ]});

  // Plan 2: Xưởng hàn — phương án B (không xung đột)
  const plan2 = await prisma.plan.create({ data: { layoutId: layout1.id, name: 'KH tháng 9 — Phương án B' } });
  await prisma.planItem.createMany({ data: [
    { planId: plan2.id, productId: products[0].id, x: 15, y: 15, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-15') },
    { planId: plan2.id, productId: products[4].id, x: 15, y: 15, startDate: new Date('2026-09-16'), endDate: new Date('2026-09-30') },
    { planId: plan2.id, productId: products[1].id, x: 40, y: 15, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-30') },
  ]});

  // Plan 3: Xưởng lắp ráp — tháng 9
  const plan3 = await prisma.plan.create({ data: { layoutId: layout2.id, name: 'KH lắp ráp T9' } });
  await prisma.planItem.createMany({ data: [
    { planId: plan3.id, productId: products[3].id, x: 10, y: 10, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-20') },
    { planId: plan3.id, productId: products[4].id, x: 35, y: 10, startDate: new Date('2026-09-05'), endDate: new Date('2026-09-25') },
    { planId: plan3.id, productId: products[7].id, x: 60, y: 10, startDate: new Date('2026-09-10'), endDate: new Date('2026-10-05') },
  ]});

  // Plan 4: Bãi chứa — tháng 10
  const plan4 = await prisma.plan.create({ data: { layoutId: layout3.id, name: 'KH bãi chứa T10' } });
  await prisma.planItem.createMany({ data: [
    { planId: plan4.id, productId: products[1].id, x: 20, y: 20, startDate: new Date('2026-10-01'), endDate: new Date('2026-10-20') },
    { planId: plan4.id, productId: products[5].id, x: 50, y: 20, startDate: new Date('2026-10-01'), endDate: new Date('2026-10-30') },
    { planId: plan4.id, productId: products[6].id, x: 80, y: 20, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-25') },
    { planId: plan4.id, productId: products[7].id, x: 110, y: 20, startDate: new Date('2026-10-10'), endDate: new Date('2026-11-05') },
  ]});

  console.log(`[Plans] 4 plans — "${plan1.name}" (5 items, có xung đột), "${plan2.name}" (3 items), "${plan3.name}" (3 items), "${plan4.name}" (4 items)`);

  // ============================================================
  // TỔNG KẾT
  // ============================================================
  console.log('\n══════════════════════════════════════');
  console.log('  SEED HOÀN TẤT — Mật khẩu: 123456');
  console.log('══════════════════════════════════════');
  console.log(`
Tài khoản test:
  admin@vhe.com      → ADMIN (toàn quyền)
  kehoach1@vhe.com   → PLANNING (plan, snapshot, product)
  kehoach2@vhe.com   → PLANNING
  viewer@vhe.com     → VIEWER (chỉ xem)
  moi@vhe.com        → PENDING (chờ duyệt)

Luồng test:
  1. Login admin@vhe.com → Dashboard tổng quan
  2. Nhà máy VHE1 → Xưởng hàn → Editor → tab Bố trí (3 snapshots)
  3. Tab Kế hoạch → "KH tháng 9" → Gantt + 1 xung đột đỏ
  4. Tab Bố trí → bấm "So sánh KH/TT" → so sánh plan vs snapshot
  5. Đơn hàng 10020 → xem sản phẩm + CAD 3D
  6. /admin/users → duyệt moi@vhe.com (PENDING → VIEWER)
  7. Logout → login kehoach1@vhe.com → không thấy nút tạo site/layout
  8. Login viewer@vhe.com → chỉ xem, không có nút tạo/sửa/xóa
  9. /register → tạo tài khoản mới → trang chờ phân quyền
`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
