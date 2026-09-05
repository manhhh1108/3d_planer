import { test, expect } from '@playwright/test';
import {
  fixture, login, openEditor, countColorOnPlanCanvas, countHueOnCanvas, VIEWER3D_CANVAS,
} from './helpers';

test.beforeEach(async ({ page }) => login(page));

test.describe('canvas 2D tô màu theo công đoạn', () => {
  test('block đã gán công đoạn mang màu công đoạn, block chưa gán giữ màu riêng', async ({ page }) => {
    await openEditor(page, fixture.layoutId);

    // BLOCK-A gán công đoạn Sơn (#10b981); BLOCK-B chưa gán nên giữ màu sản phẩm
    const stage = await countColorOnPlanCanvas(page, fixture.stageSonColor);
    const own = await countColorOnPlanCanvas(page, fixture.blockColor);
    // Màu không xuất hiện ở đâu trong bảng màu của app — chốt rằng phép đếm
    // không phải cứ hỏi màu nào cũng trả về số dương.
    const control = await countColorOnPlanCanvas(page, '#7b2fbe');

    expect(stage).toBeGreaterThan(100);
    expect(own).toBeGreaterThan(50);
    expect(control).toBe(0);
  });

  test('mặt bằng không có block nào gán công đoạn thì không thấy màu công đoạn', async ({ page }) => {
    // Mặt bằng "xa nhau" chỉ có block gán Sơn -> dùng nó làm đối chứng dương;
    // ở đây kiểm chiều ngược lại: màu công đoạn KHÔNG tự nhiên xuất hiện.
    await openEditor(page, fixture.layoutFarId);
    expect(await countColorOnPlanCanvas(page, '#8b5cf6')).toBe(0); // Đóng kiện — không block nào mang
  });
});

test.describe('viewer 3D tô màu theo công đoạn', () => {
  /**
   * Hai mặt bằng giống hệt nhau, chỉ khác việc khối có gán công đoạn hay không.
   * So hai trạng thái thay vì so với một ngưỡng tuyệt đối — ánh sáng và tone
   * mapping của Three.js làm mã màu ra ảnh lệch khá xa màu gốc, nên phân loại
   * theo TÔNG MÀU: công đoạn Sơn xanh lục (hue 160), màu riêng của block hồng
   * cánh sen (hue 300).
   */
  async function hues(page: import('@playwright/test').Page, layoutId: string) {
    await openEditor(page, layoutId);
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.locator(VIEWER3D_CANVAS)).toBeVisible({ timeout: 30_000 });
    // Three.js nạp động, dựng scene rồi mới canh khung
    await page.waitForTimeout(5000);
    return {
      stage: await countHueOnCanvas(page, VIEWER3D_CANVAS, fixture.stageSonHue),
      own: await countHueOnCanvas(page, VIEWER3D_CANVAS, fixture.blockHue),
    };
  }

  test('khối đã gán công đoạn -> mesh mang màu công đoạn', async ({ page }) => {
    const { stage, own } = await hues(page, fixture.layout3dStagedId);
    expect(stage).toBeGreaterThan(1000);
    expect(own).toBeLessThan(stage / 20);
  });

  test('khối chưa gán công đoạn -> mesh giữ màu riêng của sản phẩm', async ({ page }) => {
    const { stage, own } = await hues(page, fixture.layout3dPlainId);
    expect(own).toBeGreaterThan(1000);
    expect(stage).toBeLessThan(own / 20);
  });
});
