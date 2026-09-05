import { describe, it, expect } from 'vitest';
import { toRings, outlinesOverlap, outlinesGap, itemsCollide } from './collisionGeometry';

const rect = (x: number, y: number, w: number, h: number) => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];

/** Chữ L 100x100 khoét ô 50x50 ở góc trên-phải. */
const L = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 },
  { x: 50, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 100 },
];

describe('toRings', () => {
  it('ring trần -> bọc thành 1 phần tử', () => {
    expect(toRings(rect(0, 0, 1, 1))).toHaveLength(1);
  });
  it('danh sách ring giữ nguyên', () => {
    expect(toRings([rect(0, 0, 1, 1), rect(5, 5, 1, 1)])).toHaveLength(2);
  });
  it('rỗng -> rỗng', () => {
    expect(toRings([])).toEqual([]);
  });
});

describe('outlinesOverlap', () => {
  it('chồng thật / rời hẳn', () => {
    expect(outlinesOverlap(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
    expect(outlinesOverlap(rect(0, 0, 10, 10), rect(50, 50, 10, 10))).toBe(false);
  });

  it('chạm mép = chưa chồng', () => {
    expect(outlinesOverlap(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false);
  });

  it('đè nhau nhưng cạnh trên/dưới trùng phương vẫn bắt được', () => {
    // Mọi đỉnh của cái này đều nằm trên biên cái kia, không cặp cạnh nào cắt
    // nhau thật sự — trường hợp suy biến mà chỉ dò đỉnh sẽ bỏ sót.
    expect(outlinesOverlap(rect(0, 0, 10, 10), rect(5, 0, 10, 10))).toBe(true);
  });

  it('lồng trọn vào nhau (không cạnh nào cắt) vẫn là chồng', () => {
    expect(outlinesOverlap(rect(0, 0, 100, 100), rect(40, 40, 10, 10))).toBe(true);
  });

  it('nằm trong phần LÕM của chữ L thì không chồng', () => {
    expect(outlinesOverlap(L, rect(60, 60, 30, 30))).toBe(false);
    // ...còn chữ nhật bao của chữ L thì có
    expect(outlinesOverlap(rect(0, 0, 100, 100), rect(60, 60, 30, 30))).toBe(true);
  });
});

describe('outlinesGap', () => {
  it('khe hở giữa hai chữ nhật rời', () => {
    expect(outlinesGap(rect(0, 0, 10, 10), rect(30, 0, 10, 10))).toBeCloseTo(20, 9);
  });
  it('chạm mép -> 0', () => {
    expect(outlinesGap(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBeCloseTo(0, 9);
  });
  it('đo tới cạnh lõm chứ không tới chữ nhật bao', () => {
    // Ô 30x30 tại (60,60): cách cạnh lõm x=50 và y=50 đúng 10
    expect(outlinesGap(L, rect(60, 60, 30, 30))).toBeCloseTo(10, 9);
  });
});

describe('itemsCollide', () => {
  it('theo max(margin), chạm mép sau khi nới vẫn chưa va chạm', () => {
    expect(itemsCollide(rect(0, 0, 10, 10), 50, rect(60, 0, 10, 10), 50)).toBe(false); // gap 50
    expect(itemsCollide(rect(0, 0, 10, 10), 50, rect(70, 0, 10, 10), 50)).toBe(false); // gap 60
    expect(itemsCollide(rect(0, 0, 10, 10), 50, rect(30, 0, 10, 10), 50)).toBe(true);  // gap 20
    expect(itemsCollide(rect(0, 0, 10, 10), 0, rect(5, 0, 10, 10), 0)).toBe(true);     // chồng thật
  });

  it('lấy margin lớn hơn trong hai bên', () => {
    const a = rect(0, 0, 10, 10), b = rect(40, 0, 10, 10); // gap 30
    expect(itemsCollide(a, 0, b, 40)).toBe(true);
    expect(itemsCollide(a, 40, b, 0)).toBe(true);
    expect(itemsCollide(a, 0, b, 20)).toBe(false);
  });

  it('nhiều ring rời của cùng một block đều được tính', () => {
    const twoParts = [rect(0, 0, 10, 10), rect(200, 0, 10, 10)];
    // Chỉ mảnh thứ hai mới gần đối tượng kia
    expect(itemsCollide(twoParts, 0, rect(215, 0, 10, 10), 10)).toBe(true);
    expect(itemsCollide(twoParts, 0, rect(215, 0, 10, 10), 4)).toBe(false);
  });
});
