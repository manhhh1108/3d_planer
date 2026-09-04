import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DEFAULT_STAGES = [
  { name: 'Gá', color: '#f59e0b' },
  { name: 'Lắp thử', color: '#3b82f6' },
  { name: 'Hàn', color: '#ef4444' },
  { name: 'Sơn', color: '#10b981' },
  { name: 'Đóng kiện', color: '#8b5cf6' },
  { name: 'Bảo ôn', color: '#06b6d4' },
  { name: 'Chờ giao hàng', color: '#6b7280' },
];

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL/PASSWORD chưa đặt — bỏ qua seed admin');
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name: 'Admin', role: 'ADMIN', passwordHash },
  });
  console.log(`Admin created: ${user.email} (id: ${user.id})`);
}

async function seedStages() {
  const count = await prisma.stage.count();
  if (count > 0) {
    console.log(`Stages already exist (${count}) — bỏ qua seed công đoạn`);
    return;
  }
  await prisma.stage.createMany({
    data: DEFAULT_STAGES.map((s, i) => ({ name: s.name, color: s.color, order: i })),
  });
  console.log(`Seeded ${DEFAULT_STAGES.length} công đoạn mặc định`);
}

async function seedSettings() {
  const existing = await prisma.appSetting.findUnique({ where: { key: 'outsideZonePolicy' } });
  if (existing) return;
  await prisma.appSetting.create({ data: { key: 'outsideZonePolicy', value: 'warn' } });
  console.log('Seeded outsideZonePolicy = warn');
}

async function main() {
  await seedAdmin();
  await seedStages();
  await seedSettings();
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
