/**
 * Dữ liệu cố định cho bộ E2E: xoá sạch rồi dựng lại từ đầu nên chạy bao nhiêu
 * lần cũng ra đúng một trạng thái.
 *
 * Ghi id ra `floor-manager-web/e2e/fixture.json` để test mở thẳng đúng mặt bằng
 * thay vì phải bấm qua giao diện tìm — điều hướng không phải thứ các test này
 * muốn kiểm.
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import prisma from '../server/db.js';

const ADMIN_EMAIL = 'e2e@test.local';
const ADMIN_PASSWORD = 'E2ePass123!';

const STAGES = [
  { name: 'Gá', color: '#f59e0b' },
  { name: 'Lắp thử', color: '#3b82f6' },
  { name: 'Hàn', color: '#ef4444' },
  { name: 'Sơn', color: '#10b981' },
  { name: 'Đóng kiện', color: '#8b5cf6' },
  { name: 'Bảo ôn', color: '#06b6d4' },
  { name: 'Chờ giao hàng', color: '#6b7280' },
];

/** Hôm nay theo giờ máy — editor mở snapshot của ngày hiện tại. */
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Vuông cạnh `s` mét, góc dưới-trái tại (ox, oy). */
const square = (s: number, ox: number, oy: number) => [
  { x: ox, y: oy }, { x: ox + s, y: oy }, { x: ox + s, y: oy + s }, { x: ox, y: oy + s },
];

await prisma.$executeRawUnsafe(
  'TRUNCATE TABLE "comments","plan_items","plans","positions","snapshots","layouts","sites","products","projects","assets","users","stages","app_settings" CASCADE',
);

await prisma.user.create({
  data: {
    email: ADMIN_EMAIL,
    name: 'E2E Admin',
    role: 'ADMIN',
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4), // cost thấp cho nhanh
  },
});

await prisma.stage.createMany({
  data: STAGES.map((s, i) => ({ name: s.name, color: s.color, order: i })),
});
await prisma.appSetting.createMany({
  data: [
    { key: 'outsideZonePolicy', value: 'warn' },
    { key: 'defaultMarginCm', value: 50 },
  ],
});
const stages = await prisma.stage.findMany();
const stageId = (name: string) => stages.find((s) => s.name === name)!.id;

const site = await prisma.site.create({ data: { name: 'E2E Site' } });
const project = await prisma.project.create({ data: { name: 'E2E Project' } });

/** Sản phẩm vuông `m` mét. Màu đặt riêng biệt để test phân biệt được trên ảnh. */
async function product(code: string, color: string, m = 2) {
  return prisma.product.create({
    data: {
      projectId: project.id, name: code, code, color, areaM2: m * m,
      metadata: { widthM: m, depthM: m, heightM: 2 },
    },
  });
}

const blockA = await product('BLOCK-A', '#ff00ff'); // hồng cánh sen — không trùng màu công đoạn nào
const blockB = await product('BLOCK-B', '#ff00ff');
const blockC = await product('BLOCK-C', '#ff00ff');
const blockD = await product('BLOCK-D', '#ff00ff');

const date = new Date(todayStr());

// ── Mặt bằng chính: 2 vùng, 1 vùng một công đoạn, 1 vùng hai công đoạn ──────
const layout = await prisma.layout.create({
  data: { siteId: site.id, name: 'E2E Layout', widthM: 60, heightM: 40 },
});
await prisma.snapshot.create({
  data: {
    layoutId: layout.id,
    date,
    createdBy: ADMIN_EMAIL,
    // 2 vùng 20x20 = 800 m², nhỏ hơn hẳn khung bao 60x40 = 2400 m²
    zones: [
      { id: 'z-son', name: 'Vùng sơn', points: square(20, 2, 2), allowedStageIds: [stageId('Sơn')] },
      { id: 'z-multi', name: 'Vùng gá/hàn', points: square(20, 30, 2), allowedStageIds: [stageId('Gá'), stageId('Hàn')] },
    ] as never,
    positions: {
      create: [
        // Đã gán công đoạn Sơn -> phải hiện màu #10b981
        { productId: blockA.id, x: 6, y: 6, updatedBy: ADMIN_EMAIL, stageId: stageId('Sơn') },
        // Chưa gán công đoạn -> giữ màu riêng #ff00ff
        { productId: blockB.id, x: 35, y: 6, updatedBy: ADMIN_EMAIL },
      ],
    },
  },
});

// ── Hai mặt bằng chỉ khác khoảng cách, để so trạng thái có/không va chạm ────
async function gapLayout(name: string, gapM: number) {
  const l = await prisma.layout.create({
    data: { siteId: site.id, name, widthM: 60, heightM: 40 },
  });
  await prisma.snapshot.create({
    data: {
      layoutId: l.id, date, createdBy: ADMIN_EMAIL,
      zones: [{ id: 'z', name: 'Vùng', points: square(30, 2, 2), allowedStageIds: [stageId('Sơn')] }] as never,
      positions: {
        create: [
          { productId: blockC.id, x: 10, y: 10, updatedBy: ADMIN_EMAIL, stageId: stageId('Sơn') },
          // Block vuông 2m -> khe hở = gapM
          { productId: blockD.id, x: 10 + 2 + gapM, y: 10, updatedBy: ADMIN_EMAIL, stageId: stageId('Sơn') },
        ],
      },
    },
  });
  return l.id;
}
// margin mặc định 50cm: 0.3m là va chạm, 5m thì không
const layoutClose = await gapLayout('E2E Gan nhau', 0.3);
const layoutFar = await gapLayout('E2E Xa nhau', 5);

// ── Hai mặt bằng cho viewer 3D ─────────────────────────────────────────────
// Một khối to gần kín mặt bằng để nó chiếm phần lớn khung hình 3D — khối 2m
// trong mặt bằng 60x40 chỉ còn vài chục pixel, không đủ để đọc màu tin cậy.
async function bigBlockLayout(name: string, code: string, withStage: boolean) {
  const l = await prisma.layout.create({
    data: { siteId: site.id, name, widthM: 20, heightM: 20 },
  });
  const p = await product(code, '#ff00ff', 16);
  await prisma.snapshot.create({
    data: {
      layoutId: l.id, date, createdBy: ADMIN_EMAIL,
      positions: {
        create: [{
          productId: p.id, x: 10, y: 10, updatedBy: ADMIN_EMAIL,
          stageId: withStage ? stageId('Sơn') : null,
        }],
      },
    },
  });
  return l.id;
}
const layout3dStaged = await bigBlockLayout('E2E 3D co cong doan', 'BIG-STAGED', true);
const layout3dPlain = await bigBlockLayout('E2E 3D khong cong doan', 'BIG-PLAIN', false);

const fixture = {
  admin: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  date: todayStr(),
  siteId: site.id,
  projectId: project.id,
  layoutId: layout.id,
  layoutCloseId: layoutClose,
  layoutFarId: layoutFar,
  layout3dStagedId: layout3dStaged,
  layout3dPlainId: layout3dPlain,
  stageSonHue: 160,   // #10b981
  blockHue: 300,      // #ff00ff
  stageSonColor: '#10b981',
  blockColor: '#ff00ff',
  collisionColor: '#dc2626',
  zonesAreaM2: 800,
};

const out = path.resolve('../floor-manager-web/e2e/fixture.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(fixture, null, 2));
console.log('E2E fixture:', out);
await prisma.$disconnect();
