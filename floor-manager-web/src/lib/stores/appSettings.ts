import { writable, get } from 'svelte/store';
import { api, type OutsideZonePolicy } from '$lib/services/api';

export const outsideZonePolicy = writable<OutsideZonePolicy>('warn');
export const defaultMarginCm = writable<number>(50);
export function getDefaultMarginCm(): number { return get(defaultMarginCm); }
let loaded = false;

export async function loadAppSettings(force = false): Promise<void> {
  if (loaded && !force) return;
  try {
    const r = await api.settings.get<OutsideZonePolicy>('outsideZonePolicy');
    outsideZonePolicy.set((r.value ?? 'warn') as OutsideZonePolicy);
    try {
      const m = await api.settings.get<number>('defaultMarginCm');
      const n = Number(m.value);
      defaultMarginCm.set(Number.isFinite(n) && n >= 0 ? n : 50);
    } catch { defaultMarginCm.set(50); }
    loaded = true;
  } catch {
    outsideZonePolicy.set('warn');
  }
}

export function getOutsideZonePolicy(): OutsideZonePolicy {
  return get(outsideZonePolicy);
}
