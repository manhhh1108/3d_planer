import { test, expect } from '@playwright/test';
import { fixture, login, openEditor, countColorOnPlanCanvas } from './helpers';

test.beforeEach(async ({ page }) => login(page));

/**
 * Hai mặt bằng giống hệt nhau, chỉ khác khoảng cách giữa hai block: 0.3 m và
 * 5 m, trong khi margin mặc định là 50 cm. So hai trạng thái với nhau tránh
 * phải đoán một ngưỡng số pixel tuyệt đối.
 */
test.describe('cảnh báo va chạm trên canvas', () => {
  test('khe hở 30cm < margin 50cm -> có dấu đỏ', async ({ page }) => {
    await openEditor(page, fixture.layoutCloseId);
    const red = await countColorOnPlanCanvas(page, fixture.collisionColor);
    expect(red, 'phải có phủ đỏ + viền đứt đỏ').toBeGreaterThan(100);
  });

  test('khe hở 5m > margin 50cm -> không dấu đỏ nào', async ({ page }) => {
    await openEditor(page, fixture.layoutFarId);
    const red = await countColorOnPlanCanvas(page, fixture.collisionColor);
    expect(red).toBeLessThan(20);
  });
});
