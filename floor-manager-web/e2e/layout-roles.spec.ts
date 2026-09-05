import { test, expect } from '@playwright/test';
import { fixture, login } from './helpers';

type P = import('@playwright/test').Page;
const addLayout = (p: P) => p.getByRole('button', { name: '+ Thêm layout' });
const editSite = (p: P) => p.getByRole('button', { name: 'Sửa thông tin mặt bằng' });
const editLayout = (p: P) => p.getByRole('button', { name: 'Sửa layout' }).first();

/**
 * Ranh giới quyền: Layout (mặt bằng thi công) là việc của người lập kế hoạch,
 * còn Site (nhà máy, kho bãi chứa các layout) vẫn là cấu hình của quản trị.
 */
test.describe('PLANNING', () => {
  test.beforeEach(async ({ page }) => login(page, 'planning'));

  test('thấy nút tạo và sửa layout', async ({ page }) => {
    await page.goto(`/site/${fixture.siteId}`);
    await expect(addLayout(page)).toBeVisible();
    await expect(editLayout(page)).toBeAttached();
  });

  test('không thấy nút sửa thông tin site', async ({ page }) => {
    await page.goto(`/site/${fixture.siteId}`);
    await expect(addLayout(page)).toBeVisible(); // trang đã tải xong
    await expect(editSite(page)).toHaveCount(0);
  });

  test('đổi được nền bản vẽ của layout', async ({ page }) => {
    await page.goto(`/site/${fixture.siteId}`);
    // Ô nhập file nền chỉ dựng ra cho người có quyền sửa layout
    await expect(page.locator('input[type="file"]').first()).toBeAttached();
  });
});

test.describe('ADMIN', () => {
  test.beforeEach(async ({ page }) => login(page, 'admin'));

  test('thấy cả nút sửa site lẫn nút tạo layout', async ({ page }) => {
    await page.goto(`/site/${fixture.siteId}`);
    await expect(editSite(page)).toBeVisible();
    await expect(addLayout(page)).toBeVisible();
  });
});
