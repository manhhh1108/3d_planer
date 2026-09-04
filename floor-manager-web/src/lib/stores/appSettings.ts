import { writable, get } from 'svelte/store';
import { api, type OutsideZonePolicy } from '$lib/services/api';

export const outsideZonePolicy = writable<OutsideZonePolicy>('warn');
let loaded = false;

export async function loadAppSettings(force = false): Promise<void> {
  if (loaded && !force) return;
  try {
    const r = await api.settings.get<OutsideZonePolicy>('outsideZonePolicy');
    outsideZonePolicy.set((r.value ?? 'warn') as OutsideZonePolicy);
    loaded = true;
  } catch {
    outsideZonePolicy.set('warn');
  }
}

export function getOutsideZonePolicy(): OutsideZonePolicy {
  return get(outsideZonePolicy);
}
