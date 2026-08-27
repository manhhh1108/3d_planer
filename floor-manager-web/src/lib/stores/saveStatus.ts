import { writable, get } from 'svelte/store';
import { currentProject } from './project';
import { getActiveStore } from '$lib/services/datastore';
import { saveSnapshot } from '$lib/stores/versionHistory';
import { isTimelineReadonly } from './timeline';
import { lockedByOther, lockHolderName } from './editLock';
import { todayStr } from '$lib/services/mapping';

export type SaveState = 'saved' | 'unsaved' | 'saving';

export const saveState = writable<SaveState>('saved');
/** Lý do lần lưu gần nhất bị chặn, null nếu không bị chặn */
export const saveBlockedReason = writable<string | null>(null);
export const lastSavedAt = writable<Date | null>(null);

/**
 * Ngày mà editor đang soạn bố cục cho, null = hôm nay.
 *
 * Trước đây autosave luôn ghi vào hôm nay vì không có khái niệm này: bố trí
 * cho ngày mai xong thì snapshot hôm nay bị đè bằng bố cục ngày mai. Sau khi
 * "Lưu Snapshot" vào ngày X thì X trở thành ngày đích của cả autosave.
 */
export const workingDate = writable<string | null>(null);

/** Ngày mà lần lưu tiếp theo sẽ ghi vào */
export function saveTargetDate(): string {
  return get(workingDate) ?? todayStr();
}

const AUTOSAVE_KEY = 'fm_autosave_enabled';

function readAutoSavePref(): boolean {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) !== '0';
  } catch {
    return true; // không đọc được localStorage thì cứ tự lưu, an toàn hơn là mất việc
  }
}

/** Tự lưu sau mỗi thay đổi. Tắt được để soạn nhiều ngày mà không ghi lung tung. */
export const autoSaveEnabled = writable<boolean>(readAutoSavePref());

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let skipNext = false;

autoSaveEnabled.subscribe((on) => {
  try {
    localStorage.setItem(AUTOSAVE_KEY, on ? '1' : '0');
  } catch {
    /* chế độ ẩn danh — không nhớ được thì thôi */
  }
  if (!on && debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
});

/** Call once to start watching project changes */
export function initAutoSave() {
  if (initialized) return;
  initialized = true;

  let first = true;
  currentProject.subscribe((_p) => {
    // Skip the initial subscription fire and loadProject calls
    if (first) { first = false; return; }
    if (skipNext) { skipNext = false; return; }
    if (!_p) return;
    markDirty();
  });
}

/** Mark project as dirty (unsaved). */
export function markDirty() {
  if (isTimelineReadonly()) return; // đang xem snapshot cũ — không auto-save
  saveState.set('unsaved');
  if (debounceTimer) clearTimeout(debounceTimer);
  // Người khác đang giữ khoá: cứ để người dùng bố trí thoải mái, chỉ đừng
  // nã request lưu mỗi 5 giây để rồi ăn 423.
  if (get(lockedByOther)) {
    saveBlockedReason.set(`Đang được ${lockHolderName()} chỉnh sửa — chưa lưu được`);
    return;
  }
  saveBlockedReason.set(null);
  if (!get(autoSaveEnabled)) return; // tắt tự lưu: vẫn báo "chưa lưu", chỉ không tự ghi
  debounceTimer = setTimeout(() => {
    autoSave();
  }, 5000);
}

function captureThumbnail(projectId: string) {
  try {
    // Ưu tiên canvas mặt bằng 2D: ở chế độ 3D thì canvas đầu tiên trong DOM là
    // của Three.js, và minimap cũng là một canvas.
    const canvas = (document.querySelector('canvas[data-plan-canvas]')
      ?? document.querySelector('canvas')) as HTMLCanvasElement | null;
    if (!canvas || !canvas.width || !canvas.height) return;
    const size = 300;
    const tmp = document.createElement('canvas');
    tmp.width = size;
    tmp.height = Math.round(size * (canvas.height / canvas.width));
    const ctx = tmp.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
    const dataUrl = tmp.toDataURL('image/jpeg', 0.6);
    getActiveStore().saveThumbnail(projectId, dataUrl);
  } catch {}
}

async function autoSave() {
  if (isTimelineReadonly()) return;
  if (!get(autoSaveEnabled)) return;
  if (get(lockedByOther)) return;
  const p = get(currentProject);
  if (!p) return;
  saveState.set('saving');
  try {
    // Ghi vào ngày đang soạn, không mặc định hôm nay
    await getActiveStore().save(p, saveTargetDate());
    captureThumbnail(p.id);
    saveState.set('saved');
    lastSavedAt.set(new Date());
  } catch (e) {
    console.error('[AutoSave] Failed:', e);
    saveState.set('unsaved');
  }
}

/** Manual save */
export async function manualSave(date?: string) {
  if (isTimelineReadonly()) return; // không lưu khi đang xem ngày cũ
  if (debounceTimer) clearTimeout(debounceTimer);
  const p = get(currentProject);
  if (!p) return;
  const target = date ?? saveTargetDate();
  if (get(lockedByOther)) {
    const reason = `Đang được ${lockHolderName()} chỉnh sửa — chưa lưu được`;
    saveBlockedReason.set(reason);
    saveState.set('unsaved');
    throw new Error(reason);
  }
  saveState.set('saving');
  try {
    await getActiveStore().save(p, target);
    captureThumbnail(p.id);
    saveSnapshot(p, 'Manual save');
    // Lưu sang ngày khác = từ giờ đang soạn cho ngày đó
    workingDate.set(target === todayStr() ? null : target);
    saveState.set('saved');
    lastSavedAt.set(new Date());
  } catch (e) {
    console.error('[Save] Failed:', e);
    if (e instanceof Error && /423|chỉnh sửa/.test(e.message)) saveBlockedReason.set(e.message);
    saveState.set('unsaved');
    throw e;
  }
}

/** Mark as saved without triggering dirty (e.g. after loadProject) */
/** Về lại chế độ soạn cho hôm nay */
export function resetWorkingDate() {
  workingDate.set(null);
}

export function markClean() {
  if (debounceTimer) clearTimeout(debounceTimer);
  saveState.set('saved');
  skipNext = true;
}
