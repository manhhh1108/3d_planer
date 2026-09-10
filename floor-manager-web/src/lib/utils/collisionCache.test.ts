import { describe, it, expect, beforeEach } from 'vitest';
import { collisionsForFurniture } from './collision';
import { setFurnitureCatalog, type FurnitureDef } from './furnitureCatalog';
import { defaultMarginCm } from '$lib/stores/appSettings';
import type { FurnitureItem } from '$lib/models/types';

const def: FurnitureDef = {
  id: 'block', name: 'Block', category: 'Sản phẩm', icon: '📦',
  color: '#fff', width: 100, depth: 100, height: 100,
};

const item = (id: string, x: number, y: number): FurnitureItem =>
  ({ id, catalogId: 'block', position: { x, y }, rotation: 0 } as FurnitureItem);

/** Bản sao sâu — cùng nội dung, khác hoàn toàn về tham chiếu. */
const clone = (items: FurnitureItem[]): FurnitureItem[] =>
  items.map((i) => ({ ...i, position: { ...i.position } }));

beforeEach(() => {
  setFurnitureCatalog([def]);
  defaultMarginCm.set(50);
  // Xoá bộ nhớ đệm giữa các ca: mỗi ca phải tự quyết định trúng/trượt.
  collisionsForFurniture([]);
});

/**
 * `collisionsForFurniture` là O(n²) và trước đây chạy lại trên MỌI lần
 * `currentProject.set` — tức mỗi mousemove khi kéo bất cứ thứ gì, kể cả kéo một
 * vùng (không thể làm block va nhau khác đi). Đo được: 200 block ≈ 64 ms/lượt,
 * 800 block ≈ 1,9 s/lượt.
 *
 * Kiểm bằng ĐỊNH DANH của Set trả về: cùng một object nghĩa là không tính lại.
 */
describe('bộ nhớ đệm va chạm', () => {
  it('dữ liệu không đổi thì không tính lại', () => {
    const a = [item('a', 0, 0), item('b', 5000, 5000)];
    const r1 = collisionsForFurniture(a);
    const r2 = collisionsForFurniture(clone(a));
    expect(r2).toBe(r1);
  });

  it('dời một block thì tính lại', () => {
    const a = [item('a', 0, 0), item('b', 5000, 5000)];
    const r1 = collisionsForFurniture(a);
    const moved = clone(a);
    moved[1].position = { x: 10, y: 0 }; // kéo b về sát a
    const r2 = collisionsForFurniture(moved);
    expect(r2).not.toBe(r1);
    expect(r2.has('a')).toBe(true);
  });

  it('đổi id nhưng giữ nguyên hình học thì vẫn tính lại', () => {
    // Xoá một block rồi đặt block khác đúng chỗ đó: biên dạng y hệt nhưng
    // tập id trả về phải khác, nên không được dùng lại kết quả cũ.
    const r1 = collisionsForFurniture([item('a', 0, 0), item('b', 10, 0)]);
    const r2 = collisionsForFurniture([item('a', 0, 0), item('c', 10, 0)]);
    expect(r2).not.toBe(r1);
    expect(r2.has('c')).toBe(true);
    expect(r2.has('b')).toBe(false);
  });

  it('đổi margin mặc định thì tính lại', () => {
    const a = [item('a', 0, 0), item('b', 300, 0)];
    const r1 = collisionsForFurniture(a);
    expect(r1.size).toBe(0); // khe hở 200cm, margin 50cm -> không chạm
    // 250 > khe hở 200 -> chạm. (250 chứ không phải 200: chạm đúng mép không tính.)
    defaultMarginCm.set(250);
    const r2 = collisionsForFurniture(clone(a));
    expect(r2).not.toBe(r1);
    expect(r2.size).toBe(2); // margin rộng ra thì chạm nhau
  });

  it('thêm block thì tính lại', () => {
    const a = [item('a', 0, 0)];
    const r1 = collisionsForFurniture(a);
    const r2 = collisionsForFurniture([...clone(a), item('b', 10, 0)]);
    expect(r2).not.toBe(r1);
    expect(r2.size).toBe(2);
  });
});
