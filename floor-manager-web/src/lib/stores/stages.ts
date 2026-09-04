import { writable, get } from 'svelte/store';
import { api, type ApiStage } from '$lib/services/api';

/** Công đoạn active, sắp theo order. Dùng cho vùng, PropertiesPanel, tô màu. */
export const stages = writable<ApiStage[]>([]);

let loaded = false;

/** Nạp danh sách công đoạn active từ backend (chỉ nạp 1 lần trừ khi force). */
export async function loadStages(force = false): Promise<void> {
  if (loaded && !force) return;
  try {
    stages.set(await api.stages.list(false));
    loaded = true;
  } catch {
    // Thiếu công đoạn không được làm hỏng editor — để rỗng, tô màu mặc định.
    stages.set([]);
  }
}

/** Tra màu theo id công đoạn, undefined nếu không tìm thấy. */
export function stageColor(id: string | undefined | null): string | undefined {
  if (!id) return undefined;
  return get(stages).find((s) => s.id === id)?.color;
}

/** Tra tên theo id công đoạn. */
export function stageName(id: string | undefined | null): string | undefined {
  if (!id) return undefined;
  return get(stages).find((s) => s.id === id)?.name;
}
