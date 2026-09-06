import { test, expect } from '@playwright/test';
import {
  fixture, login, openEditor, openToolsPanel, countColorOnPlanCanvas, waitForStableCanvas,
} from './helpers';

test.beforeEach(async ({ page }) => login(page));

/**
 * Mặt bằng "gần nhau" có hai block cách nhau 30 cm trong khi khoảng cách yêu
 * cầu là 50 cm, nên vào là thấy cảnh báo đỏ. Sắp xếp tự động phải giãn chúng ra
 * đủ khoảng cách, tức là dấu đỏ biến mất — quan sát được ngay trên canvas.
 */
test('sắp xếp tự động giãn các block đang va chạm ra đủ khoảng cách', async ({ page }) => {
  await openEditor(page, fixture.layoutCloseId);

  const before = await countColorOnPlanCanvas(page, fixture.collisionColor);
  expect(before, 'trước khi xếp phải đang báo va chạm').toBeGreaterThan(100);

  await openToolsPanel(page);
  await page.getByRole('button', { name: /Tự động sắp xếp/ }).click();
  await waitForStableCanvas(page);

  const after = await countColorOnPlanCanvas(page, fixture.collisionColor);
  expect(after, 'xếp xong phải hết va chạm').toBeLessThan(20);
});

test('nút đổi nhãn theo việc có đang chọn vùng hay không', async ({ page }) => {
  await openEditor(page, fixture.layoutCloseId);
  await openToolsPanel(page);

  // Chưa chọn vùng nào -> áp cho tất cả
  await expect(page.getByRole('button', { name: /Tự động sắp xếp/ }))
    .toHaveText(/tất cả vùng/);
});

test('hoàn tác được bằng một bước', async ({ page }) => {
  await openEditor(page, fixture.layoutCloseId);
  await openToolsPanel(page);
  await page.getByRole('button', { name: /Tự động sắp xếp/ }).click();
  await waitForStableCanvas(page);
  expect(await countColorOnPlanCanvas(page, fixture.collisionColor)).toBeLessThan(20);

  // 'Undo' khớp cả nút "Toggle Undo History" nên phải khớp chính xác
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForStableCanvas(page);

  // Một lần undo phải trả lại nguyên trạng thái va chạm ban đầu
  expect(await countColorOnPlanCanvas(page, fixture.collisionColor)).toBeGreaterThan(100);
});

/**
 * Mặt bằng chưa vẽ vùng thì bấm nút không thể có gì đổi — nhưng phải NÓI ra,
 * không để người dùng ngồi đoán xem nút hỏng hay mình làm sai.
 */
test('mặt bằng chưa có vùng: báo rõ lý do thay vì im lặng', async ({ page }) => {
  await openEditor(page, fixture.layout3dPlainId); // fixture này không có vùng nào
  await openToolsPanel(page);
  await page.getByRole('button', { name: /Tự động sắp xếp/ }).click();

  await expect(page.getByText(/Chưa có vùng nào/)).toBeVisible();
});

test('xếp xong báo số sản phẩm đã dời', async ({ page }) => {
  await openEditor(page, fixture.layoutCloseId);
  await openToolsPanel(page);
  await page.getByRole('button', { name: /Tự động sắp xếp/ }).click();

  await expect(page.getByText(/Đã xếp lại 2 sản phẩm/)).toBeVisible();
});
