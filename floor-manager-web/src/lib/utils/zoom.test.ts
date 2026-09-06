import { describe, it, expect } from 'vitest';
import { clampZoom, MIN_ZOOM, MAX_ZOOM } from './zoom';

describe('clampZoom', () => {
  it('giữ nguyên mức zoom trong khoảng', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.05)).toBe(0.05); // 5% — dưới 10% vẫn hợp lệ
  });

  it('cho phép thu nhỏ dưới 10%', () => {
    expect(clampZoom(0.03)).toBe(0.03);
    expect(MIN_ZOOM).toBeLessThan(0.1);
  });

  it('chặn ở hai đầu', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-5)).toBe(MIN_ZOOM);
    expect(clampZoom(999)).toBe(MAX_ZOOM);
  });

  it('giá trị hỏng thì về 1 chứ không lan ra NaN', () => {
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1);
  });
});
