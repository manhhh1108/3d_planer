/**
 * Khoá mềm cho việc chỉnh sửa một (mặt bằng, ngày).
 *
 * Không chặn xem, không chặn chỉnh sửa tại chỗ — chỉ chặn LƯU. Người vào sau
 * thấy cảnh báo ai đang sửa, vẫn thử bố trí được, nhưng phải đợi người kia
 * xong mới lưu được.
 */
import { writable, derived, get } from 'svelte/store';
import { api, type ApiEditLock } from '$lib/services/api';

const FREE: ApiEditLock = { locked: false, mine: false, holder: null };

/** Gia hạn trước khi hết hạn (server để TTL 2 phút) */
const HEARTBEAT_MS = 30_000;

export const editLock = writable<ApiEditLock>(FREE);

/** Người khác đang giữ khoá — lưu sẽ bị server từ chối 423 */
export const lockedByOther = derived(
	editLock,
	($l) => $l.locked && !$l.mine
);

/** Tên người đang giữ khoá, null nếu trống hoặc là mình */
export function lockHolderName(): string | null {
	const l = get(editLock);
	return l.locked && !l.mine ? l.holder?.name ?? l.holder?.email ?? 'người khác' : null;
}

let timer: ReturnType<typeof setInterval> | null = null;
let current: { layoutId: string; date: string } | null = null;

async function tryAcquire(layoutId: string, date: string) {
	try {
		editLock.set(await api.layouts.acquireLock(layoutId, date));
	} catch {
		// Mất mạng hay lỗi server: coi như không khoá, đừng chặn oan người dùng
		editLock.set(FREE);
	}
}

/**
 * Bắt đầu giữ khoá cho (layout, ngày) và gia hạn định kỳ.
 * Gọi lại với ngày khác sẽ nhả khoá cũ trước.
 */
export function startEditLock(layoutId: string, date: string): void {
	if (current && current.layoutId === layoutId && current.date === date) return;
	stopEditLock();
	current = { layoutId, date };
	void tryAcquire(layoutId, date);
	timer = setInterval(() => {
		if (current) void tryAcquire(current.layoutId, current.date);
	}, HEARTBEAT_MS);
}

/** Nhả khoá và ngừng gia hạn. An toàn khi gọi nhiều lần. */
export function stopEditLock(): void {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	const held = current;
	current = null;
	editLock.set(FREE);
	if (held) {
		// Nhả ở phía server; hỏng cũng không sao vì khoá tự hết hạn
		api.layouts.releaseLock(held.layoutId, held.date).catch(() => {});
	}
}
