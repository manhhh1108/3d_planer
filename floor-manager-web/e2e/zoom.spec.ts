import { test, expect } from '@playwright/test';
import { fixture, login, openEditor } from './helpers';

type P = import('@playwright/test').Page;

test.beforeEach(async ({ page }) => login(page));

/** Số phần trăm zoom đang hiện trên thanh trạng thái của canvas. */
async function zoomPercent(page: P): Promise<number> {
  const text = await page.getByText(/Zoom:\s*\d+%/).innerText();
  return Number(text.match(/Zoom:\s*(\d+)%/)![1]);
}

/**
 * Có hai bộ nút zoom: thanh công cụ trên cùng ("Zoom In"/"Zoom Out") và thanh
 * nổi trên canvas ("Zoom in"/"Zoom out"). Trước đây mỗi chỗ tự kẹp giới hạn
 * riêng nên phải kiểm cả hai.
 */
const controls = {
  'thanh trên cùng': { in: 'Zoom In', out: 'Zoom Out' },
  'thanh trên canvas': { in: 'Zoom in', out: 'Zoom out' },
} as const;

for (const [where, names] of Object.entries(controls)) {
  test.describe(`giới hạn zoom — ${where}`, () => {
    test('thu nhỏ được xuống dưới 10%', async ({ page }) => {
      await openEditor(page, fixture.layoutId);
      const out = page.getByRole('button', { name: names.out, exact: true });

      // Mỗi lần bấm nhân khoảng 0.8 nên cần hơn chục lần mới qua mốc 10%
      for (let i = 0; i < 14; i++) await out.click();

      await expect.poll(() => zoomPercent(page), { timeout: 5000 }).toBeLessThan(10);
    });

    test('bấm mãi thì dừng ở 1%, không tụt về 0%', async ({ page }) => {
      await openEditor(page, fixture.layoutId);
      const out = page.getByRole('button', { name: names.out, exact: true });

      for (let i = 0; i < 45; i++) await out.click();

      // Chạm sàn thì đứng lại ở mức còn nhìn được, không phải 0%
      await expect.poll(() => zoomPercent(page), { timeout: 5000 }).toBe(1);
    });

    test('phóng to vẫn chặn ở 1000%', async ({ page }) => {
      await openEditor(page, fixture.layoutId);
      const zin = page.getByRole('button', { name: names.in, exact: true });

      for (let i = 0; i < 45; i++) await zin.click();

      await expect.poll(() => zoomPercent(page), { timeout: 5000 }).toBe(1000);
    });
  });
}
