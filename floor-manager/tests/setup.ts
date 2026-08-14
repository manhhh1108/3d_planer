import { beforeEach, afterAll } from 'vitest';
import prisma from '../server/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error('Tests must run against floormanager_test — use `npm test`, do not run vitest directly');
}

if (!process.env.JWT_ACCESS_SECRET) {
  throw new Error('JWT_ACCESS_SECRET is not set — run tests via `npm test`');
}

let _adminToken = '';
let _planningToken = '';
let _viewerToken = '';

export function adminToken() { return _adminToken; }
export function planningToken() { return _planningToken; }
export function viewerToken() { return _viewerToken; }

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "positions","snapshots","layouts","sites","products","projects","assets","users" CASCADE'
  );
  const hash = await bcrypt.hash('pass', 1); // cost=1 for test speed
  const [admin, planning, viewer] = await prisma.$transaction([
    prisma.user.create({ data: { email: 'admin@test.com', name: 'Admin', role: 'ADMIN', passwordHash: hash } }),
    prisma.user.create({ data: { email: 'planning@test.com', name: 'Planning', role: 'PLANNING', passwordHash: hash } }),
    prisma.user.create({ data: { email: 'viewer@test.com', name: 'Viewer', role: 'VIEWER', passwordHash: hash } }),
  ]);
  const secret = process.env.JWT_ACCESS_SECRET!;
  const opts = { expiresIn: '1h' } as const;
  _adminToken = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, secret, opts);
  _planningToken = jwt.sign({ id: planning.id, email: planning.email, role: planning.role }, secret, opts);
  _viewerToken = jwt.sign({ id: viewer.id, email: viewer.email, role: viewer.role }, secret, opts);
});

afterAll(async () => {
  await prisma.$disconnect();
});
