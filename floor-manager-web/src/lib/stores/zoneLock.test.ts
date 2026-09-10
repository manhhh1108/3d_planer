import { describe, it, expect } from 'vitest';
import {
  currentProject, createDefaultProject, loadProject, undoHistoryStore,
  moveZone, moveZoneVertex, removeZone, updateZone,
} from './project';
import type { WorkingZone } from '$lib/models/types';
import { get } from 'svelte/store';

/** Vùng vuông ở gốc toạ độ. `locked` để undefined thì mô phỏng dữ liệu cũ. */
const zone = (id: string, locked?: boolean): WorkingZone => ({
  id,
  name: id,
  points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  allowedStageIds: [],
  ...(locked === undefined ? {} : { locked }),
});

/** Nạp qua loadProject để undo stack (biến cấp module) sạch giữa các case. */
function seed(zones: WorkingZone[]) {
  const p = createDefaultProject('T');
  p.floors[0].zones = zones;
  loadProject(p);
}

const zoneOf = (id: string): WorkingZone | undefined =>
  get(currentProject)!.floors[0].zones?.find((z) => z.id === id);

describe('vùng bị khoá', () => {
  it('moveZone không dời được', () => {
    seed([zone('z', true)]);
    moveZone('z', 50, 50);
    expect(zoneOf('z')!.points[0]).toEqual({ x: 0, y: 0 });
  });

  it('moveZoneVertex không kéo được đỉnh', () => {
    seed([zone('z', true)]);
    moveZoneVertex('z', 0, { x: 999, y: 999 });
    expect(zoneOf('z')!.points[0]).toEqual({ x: 0, y: 0 });
  });

  it('removeZone không xoá được', () => {
    seed([zone('z', true)]);
    removeZone('z');
    expect(zoneOf('z')).toBeDefined();
  });

  it('removeZone bị chặn thì không đẻ mục undo rỗng', () => {
    seed([zone('z', true)]);
    removeZone('z');
    expect(get(undoHistoryStore).entries).toHaveLength(0);
  });

  it('vẫn đổi được tên', () => {
    seed([zone('z', true)]);
    updateZone('z', { name: 'Khu hàn A' });
    expect(zoneOf('z')!.name).toBe('Khu hàn A');
  });

  it('vẫn đổi được công đoạn cho phép', () => {
    seed([zone('z', true)]);
    updateZone('z', { allowedStageIds: ['s1'] });
    expect(zoneOf('z')!.allowedStageIds).toEqual(['s1']);
  });

  it('mở khoá xong thì dời lại bình thường', () => {
    seed([zone('z', true)]);
    updateZone('z', { locked: false });
    moveZone('z', 50, 50);
    expect(zoneOf('z')!.points[0]).toEqual({ x: 50, y: 50 });
  });
});

/**
 * ZonePropertiesPanel lấy vùng bằng `$derived.by` rồi `.find()`, và Svelte 5 so
 * sánh kết quả derived bằng ===. Hàm nào sửa vùng TẠI CHỖ thì lần derive sau vẫn
 * ra đúng object cũ, panel không vẽ lại — bấm nút khoá xong chữ đứng im, kéo đỉnh
 * xong số diện tích đứng im. Nên mọi hàm sửa vùng phải THAY object.
 */
describe('sửa vùng thì thay object để panel vẽ lại', () => {
  it('updateZone', () => {
    seed([zone('z')]);
    const before = zoneOf('z');
    updateZone('z', { locked: true });
    const after = zoneOf('z');
    expect(after).not.toBe(before);
    expect(after!.locked).toBe(true);
  });

  it('moveZoneVertex', () => {
    seed([zone('z')]);
    const before = zoneOf('z');
    moveZoneVertex('z', 1, { x: 200, y: 0 });
    const after = zoneOf('z');
    expect(after).not.toBe(before);
    expect(after!.points[1]).toEqual({ x: 200, y: 0 });
    // Object cũ không bị sửa lây — diện tích tính từ nó vẫn là hình ban đầu.
    expect(before!.points[1]).toEqual({ x: 100, y: 0 });
  });

  it('moveZone', () => {
    seed([zone('z')]);
    const before = zoneOf('z');
    moveZone('z', 10, 20);
    const after = zoneOf('z');
    expect(after).not.toBe(before);
    expect(after!.points[0]).toEqual({ x: 10, y: 20 });
  });
});

describe('vùng chưa khoá', () => {
  it('vùng cũ không có trường locked vẫn dời/xoá được như trước', () => {
    seed([zone('a'), zone('b')]);
    moveZone('a', 10, 20);
    expect(zoneOf('a')!.points[0]).toEqual({ x: 10, y: 20 });

    moveZoneVertex('a', 1, { x: 7, y: 7 });
    expect(zoneOf('a')!.points[1]).toEqual({ x: 7, y: 7 });

    removeZone('b');
    expect(zoneOf('b')).toBeUndefined();
  });
});
