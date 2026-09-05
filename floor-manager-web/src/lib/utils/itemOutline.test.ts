import { describe, it, expect, beforeEach } from 'vitest';
import { itemOutline } from './furnitureFootprint';
import { setFurnitureCatalog, type FurnitureDef } from './furnitureCatalog';
import { itemsCollide } from './collisionGeometry';
import type { FurnitureItem } from '$lib/models/types';

/** Chữ L 100x100 cm khoét góc trên-phải, canh tâm bbox (quy ước y hướng LÊN). */
const L_RING: [number, number][] = [
  [-50, -50], [50, -50], [50, 0], [0, 0], [0, 50], [-50, 50],
];

const boxDef: FurnitureDef = {
  id: 'box', name: 'Box', category: 'Sản phẩm', icon: '📦',
  color: '#fff', width: 100, depth: 100, height: 100,
};
const lDef: FurnitureDef = { ...boxDef, id: 'ell', footprint: [L_RING] };

function item(over: Partial<FurnitureItem> & { catalogId: string }): FurnitureItem {
  return {
    id: 'i1',
    position: { x: 0, y: 0 },
    rotation: 0,
    ...over,
  } as FurnitureItem;
}

beforeEach(() => setFurnitureCatalog([boxDef, lDef]));

describe('itemOutline', () => {
  it('không có footprint CAD -> chữ nhật bao', () => {
    const rings = itemOutline(item({ catalogId: 'box' }));
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
  });

  it('có footprint CAD và nằm đáy -> dùng ring CAD (đổi dấu y)', () => {
    const rings = itemOutline(item({ catalogId: 'ell' }));
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(6);
    // [-50,-50] trong bản vẽ (y lên) -> (-50, +50) trong toạ độ editor (y xuống)
    expect(rings[0][0]).toEqual({ x: -50, y: 50 });
    expect(rings[0][4]).toEqual({ x: 0, y: -50 });
  });

  it('lật nghiêng/dựng đứng -> thoái lui về chữ nhật bao', () => {
    for (const o of ['side', 'side2', 'end', 'end2'] as const) {
      const rings = itemOutline(item({ catalogId: 'ell', orientation: o }));
      expect(rings[0]).toHaveLength(4);
    }
  });

  it('xoay và dời vị trí đúng', () => {
    const rings = itemOutline(item({ catalogId: 'ell', rotation: 90, position: { x: 1000, y: 200 } }));
    // (-50, 50) quay 90°: (x,y) -> (-y, x) = (-50, -50), rồi dời
    expect(rings[0][0].x).toBeCloseTo(1000 - 50, 6);
    expect(rings[0][0].y).toBeCloseTo(200 - 50, 6);
  });

  it('người dùng gõ kích thước khác -> polygon co giãn theo', () => {
    const rings = itemOutline(item({ catalogId: 'ell', width: 200, depth: 100 }));
    expect(rings[0][1].x).toBeCloseTo(100, 6); // 50 * (200/100)
  });
});

describe('va chạm theo biên dạng lõm', () => {
  // Block chữ L, phần khoét là ô 50x50 ở góc. Một block nhỏ nằm gọn trong ô
  // khoét thì bbox báo chồng, còn biên dạng thật thì không.
  const smallDef: FurnitureDef = { ...boxDef, id: 'small', width: 30, depth: 30 };

  beforeEach(() => setFurnitureCatalog([boxDef, lDef, smallDef]));

  it('block nhỏ nằm trong phần khoét của chữ L -> không va chạm', () => {
    const ell = itemOutline(item({ id: 'l', catalogId: 'ell' }));
    // Tâm ô khoét: x +25, y -25 (editor y xuống)
    const small = itemOutline(item({ id: 's', catalogId: 'small', position: { x: 25, y: -25 } }));
    expect(itemsCollide(ell, 0, small, 0)).toBe(false);
    // Còn nếu lấy chữ nhật bao của chữ L thì lại báo chồng — chính là lỗi cũ
    const bbox = itemOutline(item({ id: 'b', catalogId: 'box' }));
    expect(itemsCollide(bbox, 0, small, 0)).toBe(true);
  });

  it('margin vẫn tính theo khe hở tới biên dạng thật', () => {
    const ell = itemOutline(item({ id: 'l', catalogId: 'ell' }));
    const small = itemOutline(item({ id: 's', catalogId: 'small', position: { x: 25, y: -25 } }));
    // khe hở tới cạnh lõm gần nhất là 10cm -> margin 20 là va chạm
    expect(itemsCollide(ell, 20, small, 0)).toBe(true);
    expect(itemsCollide(ell, 5, small, 0)).toBe(false);
  });

  it('block lồng hẳn trong block khác -> va chạm dù không cạnh nào cắt nhau', () => {
    const big = itemOutline(item({ id: 'b', catalogId: 'box' }));
    const small = itemOutline(item({ id: 's', catalogId: 'small', position: { x: 0, y: 0 } }));
    expect(itemsCollide(big, 0, small, 0)).toBe(true);
  });
});
