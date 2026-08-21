import { defineConfig } from 'vitest/config';

// Test thuần logic (không chạm DB) — bỏ setup file cần Postgres.
// Chạy: npx vitest run -c vitest.unit.config.ts
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/convertDxf*.test.ts', 'tests/geometry.test.ts', 'tests/units.test.ts'],
  },
});
