import { describe, it, expect, beforeEach } from 'vitest';
import fixture from './fixtures/l-shape-footprint.json';
import { productToDef } from '$lib/stores/productCatalog';
import { setFurnitureCatalog, type FurnitureDef } from './furnitureCatalog';
import { collisionsForFurniture } from './collision';
import { itemOutline } from './furnitureFootprint';
import { defaultMarginCm } from '$lib/stores/appSettings';
import type { FurnitureItem } from '$lib/models/types';

/**
 * Fixture là footprint.json THẬT do backend sinh ra khi nhập một file DXF chữ L
 * 4x4 m khoét ô 2x2 (bbox 4x4, diện tích 12 m²). Test này khoá lại toàn bộ dây
 * chuyền DXF -> footprint.json -> catalog -> biên dạng -> va chạm, để lần sau
 * đổi converter hay đổi quy ước trục là biết ngay.
 */
function defFromAsset(): FurnitureDef {
  const def = productToDef({
    id: 'L', name: 'L-SHAPE', code: 'L-SHAPE', category: 'san_pham', color: '#58a6ff',
    areaM2: fixture.areaM2,
    metadata: { widthM: fixture.bbox.lengthM, depthM: fixture.bbox.widthM, heightM: 1 },
  } as any);
  // Đúng bước quy đổi mét -> cm của loadProductCatalog
  def.footprint = fixture.polygons.map((ring) =>
    ring.map(([x, y]) => [x * 100, y * 100] as [number, number]),
  );
  return def;
}

const item = (id: string, x: number, y: number, catalogId: string) =>
  ({ id, catalogId, position: { x, y }, rotation: 0 }) as FurnitureItem;

beforeEach(() => {
  const l = defFromAsset();
  setFurnitureCatalog([
    l,
    { ...l, id: 'box', footprint: undefined },                             // chữ nhật bao 400x400
    { ...l, id: 'small', footprint: undefined, width: 100, depth: 100 },   // block 1x1 m
  ]);
  defaultMarginCm.set(0);
});

describe('dây chuyền footprint CAD thật (DXF chữ L)', () => {
  it('fixture đúng là chữ L: 6 đỉnh, 12 m², bbox 4x4', () => {
    expect(fixture.polygons[0]).toHaveLength(6);
    expect(fixture.areaM2).toBe(12);
    expect(fixture.bbox).toMatchObject({ lengthM: 4, widthM: 4 });
  });

  it('catalog nhận biên dạng lõm chứ không phải chữ nhật bao', () => {
    const rings = itemOutline(item('a', 0, 0, 'L'));
    expect(rings[0]).toHaveLength(6);
  });

  it('block nằm gọn trong ô khoét -> không báo va chạm', () => {
    // Ô khoét ở góc x>0, y<0 (toạ độ editor y hướng xuống); tâm ô là (100,-100) cm
    expect(collisionsForFurniture([
      item('l', 0, 0, 'L'), item('s', 100, -100, 'small'),
    ]).size).toBe(0);
  });

  it('cùng vị trí đó mà dùng chữ nhật bao thì báo va chạm — chính là lỗi cũ', () => {
    expect(collisionsForFurniture([
      item('l', 0, 0, 'box'), item('s', 100, -100, 'small'),
    ])).toEqual(new Set(['l', 's']));
  });

  it('margin vẫn đo tới cạnh lõm: 50cm chưa chạm, 60cm là va chạm', () => {
    const pair = () => [item('l', 0, 0, 'L'), item('s', 100, -100, 'small')];
    defaultMarginCm.set(50);
    expect(collisionsForFurniture(pair()).size).toBe(0);
    defaultMarginCm.set(60);
    expect(collisionsForFurniture(pair()).size).toBe(2);
  });

  it('lấn vào phần đặc của chữ L -> va chạm', () => {
    expect(collisionsForFurniture([
      item('l', 0, 0, 'L'), item('s', -100, 100, 'small'),
    ]).size).toBe(2);
  });
});
