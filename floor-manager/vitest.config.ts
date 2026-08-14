import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    env: {
      JWT_ACCESS_SECRET: 'test-jwt-access-secret-at-least-32-chars!',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-at-least-32ch!',
    },
  },
});
