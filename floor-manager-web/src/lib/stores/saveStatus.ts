import { writable, get } from 'svelte/store';
import { currentProject } from './project';
import { getActiveStore } from '$lib/services/datastore';
import { saveSnapshot } from '$lib/stores/versionHistory';
import { isTimelineReadonly, timelineDate } from './timeline';
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
/**
 * >0 = đang thay bố cục bằng dữ liệu tải về (mở layout, đổi ngày), không phải
 * người dùng sửa.
 *
 * Trước đây dùng một cờ `skipNext` bật lên trong markClean() rồi chờ lần thay
 * đổi kế tiếp tự tắt. Nhưng markClean() hay được gọi khi không còn lần cập
 * nhật store nào theo sau, nên cờ nằm treo và NUỐT LUÔN thao tác sửa thật đầu
 * tiên: kéo một block xong là editor vẫn báo "Saved ✓" và không tự lưu gì cả.
 * Subscriber của svelte store chạy đồng bộ ngay trong .set()/.update() nên bọc
 * đúng đoạn nạp dữ liệu là chặn được chính xác, không sót không thừa.
 */
let suppressDirty = 0;
/** Ngày mà lần tự lưu đang chờ sẽ ghi vào — chốt lúc hẹn giờ, không lúc chạy */
let pendingTargetDate: string | null = null;

/** Chạy fn mà mọi thay đổi currentProject bên trong không bị tính là "user sửa" */
export function applyWithoutDirty<T>(fn: () => T): T {
  suppressDirty++;
  try {
    return fn();
  } finally {
    suppressDirty--;
  }
}

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
    if (suppressDirty > 0) return;
    if (!_p) return;
    markDirty();
  });
}

/**
 * Sắp đổi ngày đang soạn: ghi ngay phần đang chờ vào ĐÚNG ngày vừa soạn.
 *
 * Bố cục trên canvas sắp bị thay bằng của ngày khác. Để hẹn giờ chạy tiếp là
 * nó ghi bố cục ngày này vào ngày kia — chính là lỗi "tự lưu đè layout của
 * ngày khác lên ngày hiện tại". Huỷ suông thì lại mất công vừa bố trí.
 */
function flushPendingSave() {
  if (!debounceTimer) return;
  clearTimeout(debounceTimer);
  debounceTimer = null;
  const target = pendingTargetDate;
  pendingTargetDate = null;
  // Lúc hẹn giờ đã kiểm tra readonly rồi, giờ chỉ cần khoá còn trống
  if (!target || get(lockedByOther) || !get(autoSaveEnabled)) return;
  void runSave(target);
}

// Mọi lần đổi ngày đích / ngày đang xem đều xả hàng đợi trước
workingDate.subscribe(flushPendingSave);
timelineDate.subscribe(flushPendingSave);

/** Mark project as dirty (unsaved). */
export function markDirty() {
  if (isTimelineReadonly()) return; // đang xem snapshot cũ — không auto-save
  saveState.set('unsaved');
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  pendingTargetDate = null;
  // Người khác đang giữ khoá: cứ để người dùng bố trí thoải mái, chỉ đừng
  // nã request lưu mỗi 5 giây để rồi ăn 423.
  if (get(lockedByOther)) {
    saveBlockedReason.set(`Đang được ${lockHolderName()} chỉnh sửa — chưa lưu được`);
    return;
  }
  saveBlockedReason.set(null);
  if (!get(autoSaveEnabled)) return; // tắt tự lưu: vẫn báo "chưa lưu", chỉ không tự ghi
  // Chốt ngày ngay bây giờ: 5 giây nữa người dùng có thể đã bấm sang ngày khác
  pendingTargetDate = saveTargetDate();
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

/** Ghi project hiện tại vào đúng ngày `target`. Dùng chung cho tự lưu và xả hàng đợi. */
async function runSave(target: string) {
  const p = get(currentProject);
  if (!p) return;
  saveState.set('saving');
  try {
    await getActiveStore().save(p, target);
    captureThumbnail(p.id);
    saveState.set('saved');
    saveBlockedReason.set(null);
    lastSavedAt.set(new Date());
  } catch (e) {
    console.error('[AutoSave] Failed:', e);
    // Im lặng nuốt lỗi là người dùng cứ đinh ninh đã lưu xong
    saveBlockedReason.set(e instanceof Error ? e.message : 'Không lưu được — thử lại');
    saveState.set('unsaved');
  }
}

async function autoSave() {
  debounceTimer = null;
  const target = pendingTargetDate ?? saveTargetDate();
  pendingTargetDate = null;
  if (isTimelineReadonly()) return;
  if (!get(autoSaveEnabled)) return;
  if (get(lockedByOther)) return;
  // Ghi vào ngày đang soạn, không mặc định hôm nay
  await runSave(target);
}

/** Manual save */
export async function manualSave(date?: string) {
  // Đang xem ngày cũ: chỉ đọc. Ném lỗi để nút lưu báo được, đừng im lặng.
  if (isTimelineReadonly()) throw new Error('Đang xem snapshot cũ — về hôm nay để lưu');
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  pendingTargetDate = null;
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
    saveBlockedReason.set(null);
    saveState.set('saved');
    lastSavedAt.set(new Date());
  } catch (e) {
    console.error('[Save] Failed:', e);
    saveBlockedReason.set(e instanceof Error ? e.message : 'Không lưu được — thử lại');
    saveState.set('unsaved');
    throw e;
  }
}

/**
 * Về lại chế độ soạn cho hôm nay.
 *
 * CHỈ đổi ngày đích. Bố cục đang hiện trên canvas vẫn là của ngày kia, nên nơi
 * gọi phải nạp lại dữ liệu hôm nay — xem `backToToday()` trong services/workingDay.
 */
export function resetWorkingDate() {
  workingDate.set(null);
}

/** Đánh dấu đã lưu (vd. sau khi nạp lại dữ liệu từ server) */
export function markClean() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  pendingTargetDate = null;
  saveBlockedReason.set(null);
  saveState.set('saved');
}
