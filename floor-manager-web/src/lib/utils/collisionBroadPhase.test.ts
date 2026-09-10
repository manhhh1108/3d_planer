import { describe, it, expect } from 'vitest';
import { computeCollisions } from './collision';
import { itemsCollide } from './collisionGeometry';
import type { Point } from '$lib/models/types';

/**
 * Vét cạn O(n²) viết độc lập ngay trong test, KHÔNG gọi vào code sản phẩm.
 * Lưới không gian chỉ được phép lọc bớt cặp phải xét, tuyệt đối không đổi kết
 * quả — nên đối chứng phải là một cài đặt riêng, không dùng chung đường mã.
 */
function bruteForce(
  items: { id: string }[],
  marginOf: (i: { id: string }) => number,
  footOf: (i: { id: string }) => Point[],
): Set<string> {
  const hit = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (itemsCollide(footOf(items[i]), marginOf(items[i]), footOf(items[j]), marginOf(items[j]))) {
        hit.add(items[i].id); hit.add(items[j].id);
      }
    }
  }
  return hit;
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống — ca hỏng phải lặp lại được. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function rect(cx: number, cy: number, w: number, h: number): Point[] {
  return [
    { x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 }, { x: cx - w / 2, y: cy + h / 2 },
  ];
}

describe('lọc thô bằng lưới không gian', () => {
  it('cho kết quả trùng khít vét cạn trên 200 bố cục ngẫu nhiên', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const n = 2 + Math.floor(r() * 40);
      const foots: Record<string, Point[]> = {};
      const margins: Record<string, number> = {};
      const items: { id: string }[] = [];
      for (let i = 0; i < n; i++) {
        const id = `i${i}`;
        items.push({ id });
        // Kích thước lệch nhau nhiều để ép lưới xử lý cả khối to lẫn khối nhỏ.
        foots[id] = rect(r() * 4000, r() * 3000, 50 + r() * 900, 50 + r() * 900);
        margins[id] = r() < 0.3 ? 0 : r() * 300;
      }
      const got = computeCollisions(items, (i) => margins[i.id], (i) => foots[i.id]);
      const want = bruteForce(items, (i) => margins[i.id], (i) => foots[i.id]);
      expect([...got].sort(), `seed ${seed}, n=${n}`).toEqual([...want].sort());
    }
  });

  it('một khối khổng lồ trùm cả bố cục vẫn ra đúng', () => {
    // Ca suy biến: khối to định đoạt cỡ ô lưới, lưới thành thô — phải vẫn đúng.
    const foots: Record<string, Point[]> = {
      big: rect(0, 0, 100000, 100000),
      a: rect(-2000, 0, 100, 100),
      b: rect(2000, 0, 100, 100),
    };
    const items = [{ id: 'big' }, { id: 'a' }, { id: 'b' }];
    const got = computeCollisions(items, () => 10, (i) => foots[i.id]);
    expect([...got].sort()).toEqual(['a', 'b', 'big']);
  });

  it('danh sách rỗng và một phần tử', () => {
    expect(computeCollisions([], () => 0, () => []).size).toBe(0);
    expect(computeCollisions([{ id: 'a' }], () => 50, () => rect(0, 0, 10, 10)).size).toBe(0);
  });

  it('biên dạng rỗng không làm hỏng lưới', () => {
    const foots: Record<string, Point[]> = { a: [], b: rect(0, 0, 10, 10) };
    expect(() => computeCollisions([{ id: 'a' }, { id: 'b' }], () => 5, (i) => foots[i.id])).not.toThrow();
  });
});
