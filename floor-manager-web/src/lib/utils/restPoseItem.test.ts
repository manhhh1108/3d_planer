import { describe, it, expect, beforeEach } from 'vitest';
import { effectiveDims, itemRestRoll } from './furnitureFootprint';
import { setFurnitureCatalog, type FurnitureDef } from './furnitureCatalog';
import { orientedDims, positionToItem, itemToPosition } from '$lib/services/mapping';
import type { ApiPosition } from '$lib/services/api';
import type { BlockOrientation, FurnitureItem, RestPose } from '$lib/models/types';

/**
 * Footprint CAD của một dải cung lệch 36° (quy ước catalog: cm, y hướng lên,
 * tâm hộp bao ở gốc). Kích thước catalog = đúng hộp bao của footprint để kx = ky = 1.
 */
function arcDef(): FurnitureDef {
  const R = 400, t = 30, span = (150 * Math.PI) / 180, phi = (36 * Math.PI) / 180, n = 48;
  const a0 = Math.PI / 2 - span / 2;
  const pts: [number, number][] = [];
  const at = (r: number, a: number) => {
    const x = r * Math.cos(a), z = r * Math.sin(a);
    const rx = x * Math.cos(phi) - z * Math.sin(phi), rz = x * Math.sin(phi) + z * Math.cos(phi);
    pts.push([rx, -rz]); // z cục bộ = −fy
  };
  for (let i = 0; i <= n; i++) at(R, a0 + (span * i) / n);
  for (let i = n; i >= 0; i--) at(R - t, a0 + (span * i) / n);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const ring = pts.map(([x, y]) => [x - cx, y - cy] as [number, number]);
  return {
    id: 'arc', name: 'ST4', category: 'Sản phẩm', icon: '◠', color: '#39f',
    width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...ys) - Math.min(...ys), height: 338,
    footprint: [ring],
  };
}

const boxDef: FurnitureDef = {
  id: 'box', name: 'Hộp', category: 'Sản phẩm', icon: '📦', color: '#fff', width: 300, depth: 200, height: 150,
};

/** Item đã lật như PropertiesPanel làm: kích thước lưu = hoán vị của catalog. */
function laid(def: FurnitureDef, o: BlockOrientation, pose?: RestPose): FurnitureItem {
  const d = orientedDims(def, o);
  return { id: 'i', catalogId: def.id, position: { x: 0, y: 0 }, rotation: 0,
    scale: { x: 1, y: 1, z: 1 }, orientation: o, pose, ...d };
}

beforeEach(() => setFurnitureCatalog([arcDef(), boxDef]));

describe('effectiveDims', () => {
  it('khối cong nằm Úp: khuôn chiếm chỗ khác số lưu (đã lăn)', () => {
    const it0 = laid(arcDef(), 'side', 'prone');
    const e = effectiveDims(it0);
    expect(Math.abs(e.width - it0.width!)).toBeGreaterThan(1);
    expect(e.depth).toBeCloseTo(338, 6); // trục đứng cũ nằm ngang theo chiều sâu
  });

  it('không có tư thế: đúng số lưu, không đụng gì', () => {
    const it0 = laid(arcDef(), 'side');
    expect(effectiveDims(it0)).toEqual({ width: it0.width, depth: it0.depth, height: it0.height });
  });

  it('khối hộp có tư thế: vẫn đúng số lưu — hành vi khối hộp không đổi', () => {
    for (const o of ['side', 'side2', 'end', 'end2'] as const) {
      for (const pose of ['prone', 'supine'] as const) {
        const it0 = laid(boxDef, o, pose);
        expect(effectiveDims(it0), `${o}/${pose}`).toEqual({ width: it0.width, depth: it0.depth, height: it0.height });
      }
    }
  });

  it('đổi kích thước thì tính lại, không trả kết quả cũ trong bộ nhớ đệm', () => {
    const a = laid(arcDef(), 'side', 'prone');
    const e1 = effectiveDims(a);
    const b = { ...a, width: a.width! * 2 };
    const e2 = effectiveDims(b);
    expect(e2.width).toBeGreaterThan(e1.width * 1.5);
  });
});

describe('itemRestRoll', () => {
  it('khối cong nằm Úp thì có lăn, khối hộp thì không', () => {
    expect(itemRestRoll(laid(arcDef(), 'side', 'prone'))).not.toBe(0);
    expect(itemRestRoll(laid(boxDef, 'side', 'prone'))).toBe(0);
  });
});

describe('ánh xạ pose qua Position', () => {
  const pos = (over: Partial<ApiPosition>): ApiPosition => ({
    id: 'p', snapshotId: 's', productId: 'arc', x: 1, y: 2, rotation: 0, scale: 1,
    orientation: 'side', ...over,
  });

  it('đọc đúng tư thế khi đang nghiêng/dựng', () => {
    expect(positionToItem(pos({ pose: 'prone' })).pose).toBe('prone');
    expect(positionToItem(pos({ orientation: 'end2', pose: 'supine' })).pose).toBe('supine');
  });

  it('dữ liệu cũ không có pose → không lăn', () => {
    expect(positionToItem(pos({})).pose).toBeUndefined();
    expect(positionToItem(pos({ pose: null })).pose).toBeUndefined();
  });

  it('bỏ qua tư thế sót trên block nằm đáy và chuỗi lạ', () => {
    expect(positionToItem(pos({ orientation: 'bottom', pose: 'prone' })).pose).toBeUndefined();
    expect(positionToItem(pos({ pose: 'lung-tung' })).pose).toBeUndefined();
  });

  it('ghi xuống: có tư thế khi nghiêng, null khi nằm đáy', () => {
    expect(itemToPosition(laid(arcDef(), 'side', 'prone')).pose).toBe('prone');
    expect(itemToPosition({ ...laid(arcDef(), 'side', 'prone'), orientation: 'bottom' }).pose).toBeNull();
    expect(itemToPosition(laid(arcDef(), 'side')).pose).toBeNull();
  });
});
