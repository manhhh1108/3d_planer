import { describe, it, expect, beforeEach } from 'vitest';
import {
  currentProject, createDefaultProject, loadProject, autoArrangeZones, undoHistoryStore,
} from './project';
import { defaultMarginCm } from './appSettings';
import { setFurnitureCatalog, type FurnitureDef } from '$lib/utils/furnitureCatalog';
import type { FurnitureItem, Point, WorkingZone } from '$lib/models/types';
import { get } from 'svelte/store';

const def: FurnitureDef = {
  id: 'block', name: 'Block', category: 'Sản phẩm', icon: '📦',
  color: '#fff', width: 100, depth: 100, height: 100,
};

const zone = (id: string, x: number, y: number, size: number, name = id): WorkingZone => ({
  id, name,
  points: [
    { x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size },
  ],
  allowedStageIds: [],
});

function item(id: string, p: Point, over: Partial<FurnitureItem> = {}): FurnitureItem {
  return { id, catalogId: 'block', position: p, rotation: 0, ...over } as FurnitureItem;
}

/**
 * Dựng project một tầng với vùng và item cho trước.
 *
 * Nạp qua `loadProject` chứ không set thẳng store: undo stack là biến cấp
 * module dùng chung cả file test, `loadProject` xoá nó nên mỗi case có lịch sử
 * sạch để đếm.
 */
function seed(zones: WorkingZone[], furniture: FurnitureItem[]) {
  const p = createDefaultProject('T');
  const floor = p.floors[0];
  floor.zones = zones;
  floor.furniture = furniture;
  loadProject(p);
}

const posOf = (id: string): Point => {
  const p = get(currentProject)!;
  return p.floors[0].furniture.find((f) => f.id === id)!.position;
};

beforeEach(() => {
  setFurnitureCatalog([def]);
  defaultMarginCm.set(50);
});

describe('autoArrangeZones', () => {
  it('dồn item trong vùng về góc, xếp lại thành hàng', () => {
    seed([zone('z', 0, 0, 1000)], [
      item('a', { x: 900, y: 900 }),
      item('b', { x: 500, y: 500 }),
    ]);
    autoArrangeZones();

    // Cả hai bị dồn về góc trên-trái của vùng, cách mép đúng bằng margin
    expect(posOf('a').x).toBeLessThan(900);
    expect(posOf('b').x).toBeLessThan(500);
  });

  it('KHÔNG đụng tới item đang khoá', () => {
    seed([zone('z', 0, 0, 1000)], [
      item('tu-do', { x: 900, y: 900 }),
      item('khoa', { x: 800, y: 800 }, { locked: true }),
    ]);
    autoArrangeZones();

    expect(posOf('khoa')).toEqual({ x: 800, y: 800 });
    expect(posOf('tu-do')).not.toEqual({ x: 900, y: 900 });
  });

  it('item ngoài mọi vùng thì để nguyên', () => {
    seed([zone('z', 0, 0, 500)], [
      item('trong', { x: 250, y: 250 }),
      item('ngoai', { x: 5000, y: 5000 }),
    ]);
    autoArrangeZones();

    expect(posOf('ngoai')).toEqual({ x: 5000, y: 5000 });
  });

  it('chỉ xếp đúng vùng được chỉ định, vùng khác giữ nguyên', () => {
    seed([zone('z1', 0, 0, 1000), zone('z2', 3000, 0, 1000)], [
      item('a', { x: 900, y: 900 }),
      item('b', { x: 3900, y: 900 }),
    ]);
    autoArrangeZones(['z1']);

    expect(posOf('a')).not.toEqual({ x: 900, y: 900 });
    expect(posOf('b')).toEqual({ x: 3900, y: 900 });
  });

  it('không truyền vùng nào thì xếp tất cả các vùng', () => {
    seed([zone('z1', 0, 0, 1000), zone('z2', 3000, 0, 1000)], [
      item('a', { x: 900, y: 900 }),
      item('b', { x: 3900, y: 900 }),
    ]);
    autoArrangeZones();

    expect(posOf('a')).not.toEqual({ x: 900, y: 900 });
    expect(posOf('b')).not.toEqual({ x: 3900, y: 900 });
  });

  it('khoảng cách lấy theo item khó tính nhất trong vùng', () => {
    // margin toàn hệ 50, một item đòi 300 -> cả vùng dùng 300
    seed([zone('z', 0, 0, 1000)], [
      item('thuong', { x: 900, y: 100 }),
      item('rong-rai', { x: 900, y: 900 }, { marginCm: 300 }),
    ]);
    autoArrangeZones();

    const a = posOf('thuong');
    const b = posOf('rong-rai');
    // Xếp cùng một hàng, mép trong cách nhau đúng margin đã chốt
    const gap = Math.abs(a.x - b.x) - 100; // trừ bề rộng một item
    expect(gap).toBeGreaterThanOrEqual(300 - 1e-6);
  });

  it('vùng chưa vẽ xong (dưới 3 đỉnh) thì bỏ qua', () => {
    const nham: WorkingZone = { id: 'x', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], allowedStageIds: [] };
    seed([nham], [item('a', { x: 5, y: 0 })]);
    autoArrangeZones();

    expect(posOf('a')).toEqual({ x: 5, y: 0 });
  });

  describe('lịch sử undo', () => {
    it('có việc để làm thì tạo đúng MỘT bước undo cho cả lượt xếp', () => {
      seed([zone('z', 0, 0, 1000)], [
        item('a', { x: 900, y: 900 }),
        item('b', { x: 800, y: 800 }),
        item('c', { x: 700, y: 700 }),
      ]);
      autoArrangeZones();

      const { entries } = get(undoHistoryStore);
      expect(entries).toHaveLength(1);
      expect(entries[0].description).toBe('Tự động sắp xếp');
    });

    it('không có gì để xếp thì KHÔNG làm bẩn lịch sử undo', () => {
      seed([zone('z', 0, 0, 1000)], [item('ngoai', { x: 5000, y: 5000 })]);
      autoArrangeZones();

      expect(get(undoHistoryStore).entries).toHaveLength(0);
    });

    it('mọi item trong vùng đều khoá cũng không tạo bước undo', () => {
      seed([zone('z', 0, 0, 1000)], [item('a', { x: 900, y: 900 }, { locked: true })]);
      autoArrangeZones();

      expect(get(undoHistoryStore).entries).toHaveLength(0);
    });
  });

  describe('báo lý do khi không có gì đổi', () => {
    it('chưa vẽ vùng nào', () => {
      seed([], [item('a', { x: 100, y: 100 })]);
      expect(autoArrangeZones().status).toBe('no-zones');
    });

    it('vùng chưa vẽ xong cũng tính là chưa có vùng', () => {
      const nham: WorkingZone = { id: 'x', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], allowedStageIds: [] };
      seed([nham], [item('a', { x: 5, y: 0 })]);
      expect(autoArrangeZones().status).toBe('no-zones');
    });

    it('có vùng nhưng không sản phẩm nào nằm trong', () => {
      seed([zone('z', 0, 0, 500)], [item('ngoai', { x: 5000, y: 5000 })]);
      expect(autoArrangeZones().status).toBe('no-items-in-zone');
    });

    it('mọi sản phẩm trong vùng đều bị khoá', () => {
      seed([zone('z', 0, 0, 1000)], [item('a', { x: 500, y: 500 }, { locked: true })]);
      expect(autoArrangeZones().status).toBe('all-locked');
    });

    it('xếp được thì đếm đúng số đã dời', () => {
      seed([zone('z', 0, 0, 1000)], [
        item('a', { x: 900, y: 900 }),
        item('b', { x: 800, y: 800 }),
      ]);
      expect(autoArrangeZones()).toEqual({ status: 'done', moved: 2, skipped: 0 });
    });

    it('vùng chật thì báo số sản phẩm không lọt', () => {
      // Vùng 300x300 với margin 50 chỉ còn 200x200 dùng được -> block 100 lọt 1 cái
      defaultMarginCm.set(50);
      seed([zone('z', 0, 0, 300)], [
        item('a', { x: 100, y: 100 }),
        item('b', { x: 200, y: 200 }),
      ]);
      const res = autoArrangeZones();
      expect(res.status).toBe('done');
      if (res.status === 'done') {
        expect(res.moved + res.skipped).toBe(2);
        expect(res.skipped).toBeGreaterThan(0);
      }
    });
  });
});
