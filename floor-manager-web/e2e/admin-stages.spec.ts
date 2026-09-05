import { test, expect } from '@playwright/test';
import { login } from './helpers';

const DEFAULT_STAGES = [
  ['Gá', '#f59e0b'], ['Lắp thử', '#3b82f6'], ['Hàn', '#ef4444'], ['Sơn', '#10b981'],
  ['Đóng kiện', '#8b5cf6'], ['Bảo ôn', '#06b6d4'], ['Chờ giao hàng', '#6b7280'],
];

test.beforeEach(async ({ page }) => login(page));

/** Tên và màu là ô nhập sửa tại chỗ, nên phải đọc giá trị chứ không tìm chữ. */
async function stageRows(page: import('@playwright/test').Page) {
  const names = await page.locator('input:not([type])').all();
  const colors = await page.locator('input[type="color"]').all();
  return {
    names: await Promise.all(names.map((i) => i.inputValue())),
    colors: await Promise.all(colors.map((i) => i.inputValue())),
  };
}

test('có đủ 7 công đoạn mặc định kèm đúng màu quy định', async ({ page }) => {
  await page.goto('/admin/stages');
  await expect(page.getByRole('heading', { name: 'Quản lý công đoạn' })).toBeVisible();

  const { names, colors } = await stageRows(page);
  for (const [name, color] of DEFAULT_STAGES) {
    expect(names, `thiếu công đoạn ${name}`).toContain(name);
    expect(colors, `thiếu màu ${color} của ${name}`).toContain(color);
  }
});

test('thêm được công đoạn mới qua giao diện', async ({ page }) => {
  await page.goto('/admin/stages');
  const name = `E2E ${Date.now()}`;

  await page.getByPlaceholder('Tên công đoạn mới').fill(name);
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();

  await expect
    .poll(async () => (await stageRows(page)).names, { timeout: 10_000 })
    .toContain(name);
});

test('sửa được margin mặc định toàn hệ thống', async ({ page }) => {
  await page.goto('/admin/stages');
  const margin = page.locator('input[type="number"][min="0"]').last();
  await expect(margin).toHaveValue('50');
});
