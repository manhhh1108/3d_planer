import { beforeEach, afterAll } from 'vitest';
import prisma from '../server/db.js';

if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error('Tests must run against floormanager_test — use `npm test`, do not run vitest directly');
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "positions","snapshots","layouts","products","projects" CASCADE'
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
