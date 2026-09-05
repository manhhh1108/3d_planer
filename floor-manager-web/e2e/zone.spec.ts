import { test, expect } from '@playwright/test';
import { fixture, login, openEditor, openToolsPanel } from './helpers';

test.beforeEach(async ({ page }) => login(page));

test('diện tích mặt bằng hiển thị bằng tổng diện tích vùng, không phải khung bao', async ({ page }) => {
  await openEditor(page, fixture.layoutId);
  await openToolsPanel(page);

  // Khung bao 60x40 = 2400 m²; hai vùng 20x20 = 800 m²
  const line = page.getByText(/Diện tích layout/);
  await expect(line).toBeVisible();
  await expect(line).toContainText(`${fixture.zonesAreaM2.toFixed(2)} m²`);
  await expect(line).not.toContainText('2400');
});

test('có công cụ vẽ vùng và nút tự động sắp xếp', async ({ page }) => {
  await openEditor(page, fixture.layoutId);
  await openToolsPanel(page);

  await expect(page.getByRole('button', { name: /Vùng/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Tự động sắp xếp/ })).toBeVisible();
});
