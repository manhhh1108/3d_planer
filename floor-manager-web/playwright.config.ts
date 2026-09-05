import { defineConfig, devices } from '@playwright/test';

/**
 * E2E chạy trên một backend + database RIÊNG (cổng 4300, db floormanager_e2e)
 * để không đụng vào DB dev đang có dữ liệu thật, cũng không tranh chấp với
 * `npm test` bên backend (bộ đó TRUNCATE db test trước mỗi case).
 *
 * Dữ liệu do `npm run e2e:prepare` bên floor-manager dựng — xem package.json,
 * script `test:e2e` gọi sẵn nên không phải nhớ chạy tay.
 */
const API_PORT = 4300;
const WEB_PORT = 5273;
const API = `http://localhost:${API_PORT}/api`;
const E2E_DB = 'postgresql://floormanager:floormanager123@localhost:5432/floormanager_e2e';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // dùng chung một database, chạy tuần tự cho khỏi giẫm nhau
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm --prefix ../floor-manager run start',
      url: `${API}/auth/me`,
      // /auth/me trả 401 khi chưa đăng nhập — vẫn là "server đã sống"
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: E2E_DB,
        PORT: String(API_PORT),
        // Tách hẳn thư mục file để không trộn với ảnh/CAD của môi trường dev
        UPLOAD_DIR: './e2e-storage/uploads',
        STORAGE_DIR: './e2e-storage/storage',
        // Web E2E chạy ở cổng riêng nên phải cho vào danh sách CORS, không thì
        // trình duyệt chặn ngay ở bước đăng nhập (curl thì vẫn qua).
        CORS_ORIGIN: `http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}`,
      },
    },
    {
      command: `npx vite dev --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_API_URL: API,        // trình duyệt gọi thẳng backend E2E
        INTERNAL_API_URL: API,    // hook SSR của SvelteKit cũng vậy
      },
    },
  ],
});
