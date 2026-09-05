import { describe, it, expect } from 'vitest';
import { polygonAreaM2, parseZones, zonesAreaM2, layoutAreaM2 } from '../server/zones.js';

const square = (s: number) => [
  { x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s },
];

describe('zones area', () => {
  it('polygonAreaM2: vuông 5m = 25 m²', () => {
    expect(polygonAreaM2(square(5))).toBeCloseTo(25, 6);
  });

  it('polygonAreaM2: bất biến theo chiều quay', () => {
    expect(polygonAreaM2([...square(5)].reverse())).toBeCloseTo(25, 6);
  });

  it('polygonAreaM2: dưới 3 điểm = 0', () => {
    expect(polygonAreaM2([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it('parseZones: bỏ vùng thiếu điểm hoặc toạ độ hỏng', () => {
    const zones = [
      { id: 'ok', points: square(2) },
      { id: 'thieu-diem', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
      { id: 'toa-do-hong', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: NaN, y: 1 }] },
      null,
      'rac',
    ];
    expect(parseZones(zones).map((z) => z.id)).toEqual(['ok']);
  });

  it('parseZones: không phải mảng -> rỗng', () => {
    expect(parseZones(null)).toEqual([]);
    expect(parseZones({ id: 'x' })).toEqual([]);
  });

  it('zonesAreaM2: cộng dồn nhiều vùng', () => {
    const zones = [
      { id: 'a', points: square(3) },  // 9
      { id: 'b', points: square(4) },  // 16
    ];
    expect(zonesAreaM2(zones)).toBeCloseTo(25, 6);
  });

  it('layoutAreaM2: có vùng thì lấy tổng vùng, không lấy khung bao', () => {
    const zones = [{ id: 'a', points: square(3) }];
    expect(layoutAreaM2(zones, { widthM: 100, heightM: 100 })).toBeCloseTo(9, 6);
  });

  it('layoutAreaM2: chưa vẽ vùng thì thoái lui về khung bao', () => {
    expect(layoutAreaM2(null, { widthM: 10, heightM: 4 })).toBeCloseTo(40, 6);
    expect(layoutAreaM2([], { widthM: 10, heightM: 4 })).toBeCloseTo(40, 6);
  });
});
