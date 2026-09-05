import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Đọc bằng fs chứ không `import ... from './fixture.json'`: file này do script
 * seed bên backend sinh ra, không có sẵn lúc TypeScript biên dịch, và import
 * JSON trong ESM còn đòi import attribute.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, 'fixture.json');
if (!fs.existsSync(fixturePath)) {
  throw new Error(
    'Thiếu e2e/fixture.json — chạy `npm run test:e2e` (tự dựng dữ liệu) thay vì gọi thẳng `playwright test`.',
  );
}

export const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
  admin: { email: string; password: string };
  date: string;
  siteId: string;
  projectId: string;
  layoutId: string;
  layoutCloseId: string;
  layoutFarId: string;
  layout3dStagedId: string;
  layout3dPlainId: string;
  stageSonHue: number;
  blockHue: number;
  stageSonColor: string;
  blockColor: string;
  collisionColor: string;
  zonesAreaM2: number;
};

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(fixture.admin.email);
  await page.locator('input[type="password"]').fill(fixture.admin.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

/**
 * Mở editor và đợi canvas vẽ xong.
 *
 * Không có sự kiện "đã vẽ xong" nào để bám, nên đợi tới khi canvas thôi đổi:
 * dữ liệu về theo nhiều chặng (project -> layout -> catalog sản phẩm -> công
 * đoạn), chụp sớm là bắt phải khung còn trắng.
 */
export async function openEditor(page: Page, layoutId: string) {
  await page.goto(`/editor?layoutId=${layoutId}`);
  const canvas = page.locator('canvas[data-plan-canvas]');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await waitForStableCanvas(page);
  // Khung nhìn mặc định không đảm bảo block nằm trong tầm mắt — canh khung cho
  // chắc rồi mới đọc pixel.
  await page.getByRole('button', { name: 'Zoom to fit' }).click();
  await waitForStableCanvas(page);
  return canvas;
}

/** Mở tab "Tools" của bảng bên trái (mặc định editor mở tab Products). */
export async function openToolsPanel(page: Page) {
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
}

/** Đợi ảnh trên canvas 2D không đổi qua 3 lần đọc liên tiếp. */
export async function waitForStableCanvas(page: Page, timeout = 20_000) {
  const signature = () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas[data-plan-canvas]');
      if (!c || !c.width) return '';
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      // Băm thưa cho nhanh — đủ để biết khung hình có đổi hay không
      let h = 0;
      for (let i = 0; i < d.length; i += 997) h = (h * 31 + d[i]) | 0;
      return `${c.width}x${c.height}:${h}`;
    });

  const deadline = Date.now() + timeout;
  let last = '';
  let same = 0;
  while (Date.now() < deadline) {
    const s = await signature();
    if (s && s === last) {
      if (++same >= 3) return;
    } else {
      same = 0;
      last = s;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Canvas 2D không ổn định sau ' + timeout + 'ms');
}

/**
 * Số pixel gần `hex` (sai số `tol` mỗi kênh) trên canvas khớp `selector`.
 *
 * Vẽ canvas cần đo sang một canvas 2D tạm rồi mới đọc: canvas WebGL không có
 * getImageData, còn drawImage thì đọc được vì renderer bật preserveDrawingBuffer.
 */
export async function countColorOnCanvas(
  page: Page,
  selector: string,
  hex: string,
  tol = 24,
): Promise<number> {
  return page.evaluate(
    ({ selector, rgb, tol }) => {
      const src = document.querySelector<HTMLCanvasElement>(selector);
      if (!src) throw new Error(`Không thấy canvas ${selector}`);
      const scratch = document.createElement('canvas');
      scratch.width = src.width;
      scratch.height = src.height;
      const ctx = scratch.getContext('2d')!;
      ctx.drawImage(src, 0, 0);
      const d = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        if (
          Math.abs(d[i] - rgb[0]) <= tol &&
          Math.abs(d[i + 1] - rgb[1]) <= tol &&
          Math.abs(d[i + 2] - rgb[2]) <= tol
        ) n++;
      }
      return n;
    },
    { selector, rgb: hexToRgb(hex), tol },
  );
}

export const PLAN_CANVAS = 'canvas[data-plan-canvas]';
export const VIEWER3D_CANVAS = 'canvas[data-viewer3d-canvas]';

/** Số pixel gần `hex` trên canvas 2D của editor. */
export function countColorOnPlanCanvas(page: Page, hex: string, tol = 24): Promise<number> {
  return countColorOnCanvas(page, PLAN_CANVAS, hex, tol);
}

/**
 * Số pixel có TÔNG MÀU quanh `hue` (độ) trên canvas khớp `selector`.
 *
 * Viewer 3D đi qua ánh sáng + tone mapping ACES nên mã màu ra ảnh lệch xa màu
 * gốc — so hex là bắt hụt. Tông màu thì gần như giữ nguyên, nên phân loại theo
 * hue mới là phép đo đúng cho 3D. `minSat` loại nền xám và bóng đổ.
 */
export async function countHueOnCanvas(
  page: Page,
  selector: string,
  hue: number,
  tolDeg = 25,
  minSat = 0.25,
): Promise<number> {
  return page.evaluate(
    ({ selector, hue, tolDeg, minSat }) => {
      const src = document.querySelector<HTMLCanvasElement>(selector);
      if (!src) throw new Error(`Không thấy canvas ${selector}`);
      const scratch = document.createElement('canvas');
      scratch.width = src.width;
      scratch.height = src.height;
      const ctx = scratch.getContext('2d')!;
      ctx.drawImage(src, 0, 0);
      const d = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const delta = max - min;
        if (max === 0 || delta / max < minSat) continue;
        let h: number;
        if (delta === 0) continue;
        else if (max === r) h = 60 * (((g - b) / delta) % 6);
        else if (max === g) h = 60 * ((b - r) / delta + 2);
        else h = 60 * ((r - g) / delta + 4);
        if (h < 0) h += 360;
        const diff = Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue));
        if (diff <= tolDeg) n++;
      }
      return n;
    },
    { selector, hue, tolDeg, minSat },
  );
}
