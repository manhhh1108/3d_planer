import { writable, derived, get } from 'svelte/store';

/**
 * Ngày snapshot đang xem trên timeline.
 * null = đang làm việc với ngày hôm nay (chế độ chỉnh sửa bình thường).
 * Khi khác null: chế độ XEM LẠI — mọi auto-save/manual-save bị chặn
 * để không ghi đè snapshot hôm nay bằng vị trí của ngày cũ.
 */
export const timelineDate = writable<string | null>(null);

export const timelineReadonly = derived(timelineDate, ($d) => $d !== null);

export function isTimelineReadonly(): boolean {
	return get(timelineDate) !== null;
}
