import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { selectedElementId, selectedElementIds, selectedZoneId } from './project';
import { layoutBgPanelOpen } from './ui';

/**
 * Bảng thuộc tính bên phải hiện ĐÚNG MỘT thứ đang chọn: item, vùng, hoặc nền.
 *
 * Trước đây cờ nền là cờ "dính": mở rồi thì nằm lì, xếp chồng dưới thuộc tính
 * item. Giờ nền được chọn như một phần tử, nên chọn item/vùng phải tự tắt nó.
 */
beforeEach(() => {
  selectedElementId.set(null);
  selectedElementIds.set(new Set());
  selectedZoneId.set(null);
  layoutBgPanelOpen.set(false);
});

describe('chọn loại trừ nhau giữa nền, item, vùng', () => {
  it('chọn một item thì tắt nền', () => {
    layoutBgPanelOpen.set(true);
    selectedElementId.set('item-1');
    expect(get(layoutBgPanelOpen)).toBe(false);
  });

  it('chọn nhiều item bằng khung kéo thì tắt nền', () => {
    layoutBgPanelOpen.set(true);
    selectedElementIds.set(new Set(['a', 'b']));
    expect(get(layoutBgPanelOpen)).toBe(false);
  });

  it('chọn một vùng thì tắt nền', () => {
    layoutBgPanelOpen.set(true);
    selectedZoneId.set('zone-1');
    expect(get(layoutBgPanelOpen)).toBe(false);
  });

  it('BỎ chọn thì không được tự bật nền lên', () => {
    // Chỉ việc chọn một thứ khác mới tắt nền; bỏ chọn là trung tính. Nếu không
    // có chốt này thì bấm Esc cũng đủ làm bảng nền nhảy ra.
    selectedElementId.set(null);
    selectedElementIds.set(new Set());
    selectedZoneId.set(null);
    expect(get(layoutBgPanelOpen)).toBe(false);
  });

  it('bật nền sau khi đã bỏ chọn thì nền giữ nguyên', () => {
    selectedElementId.set(null);
    selectedZoneId.set(null);
    layoutBgPanelOpen.set(true);
    expect(get(layoutBgPanelOpen)).toBe(true);
  });
});
