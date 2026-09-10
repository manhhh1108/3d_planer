<script lang="ts">
  import { currentProject, activeFloor, selectedZoneId, updateZone, removeZone, revalidateZones } from '$lib/stores/project';
  import { stages, loadStages } from '$lib/stores/stages';
  import { polygonArea } from '$lib/utils/zoneGeometry';
  import type { WorkingZone } from '$lib/models/types';

  loadStages();

  let zone = $derived.by<WorkingZone | null>(() => {
    void $activeFloor;
    const id = $selectedZoneId;
    const floor = $currentProject?.floors.find((f) => f.id === $currentProject?.activeFloorId);
    return floor?.zones?.find((z) => z.id === id) ?? null;
  });

  let areaM2 = $derived(zone ? polygonArea(zone.points) / 10000 : 0);

  function toggleStage(stageId: string) {
    if (!zone) return;
    const has = zone.allowedStageIds.includes(stageId);
    const next = has
      ? zone.allowedStageIds.filter((s) => s !== stageId)
      : [...zone.allowedStageIds, stageId];
    updateZone(zone.id, { allowedStageIds: next });
    // Đổi công đoạn cho phép của vùng thì tính lại cờ outOfZone cho các item.
    revalidateZones();
  }
</script>

{#if zone}
  <div class="zone-panel">
    <div class="head">
      <h3>Vùng</h3>
      <button
        class="lock {zone.locked ? 'on' : ''}"
        title={zone.locked ? 'Bỏ khoá để sửa hình vùng' : 'Khoá để khỏi lỡ tay kéo lệch'}
        onclick={() => updateZone(zone!.id, { locked: !zone!.locked })}
      >{zone.locked ? '🔒 Đã khoá' : '🔓'}</button>
    </div>
    <label>Tên
      <input value={zone.name ?? ''} onchange={(e) => { updateZone(zone!.id, { name: (e.currentTarget as HTMLInputElement).value }); revalidateZones(); }} />
    </label>
    <p>Diện tích: <strong>{areaM2.toFixed(2)} m²</strong></p>
    <p>Công đoạn được phép:</p>
    <div class="stage-list">
      {#each $stages as st (st.id)}
        <label class="stage-item">
          <input type="checkbox" checked={zone.allowedStageIds.includes(st.id)} onchange={() => toggleStage(st.id)} />
          <span class="dot" style={`background:${st.color}`}></span>{st.name}
        </label>
      {/each}
    </div>
    <button
      disabled={zone.locked}
      title={zone.locked ? 'Vùng đang khoá' : ''}
      onclick={() => { removeZone(zone!.id); selectedZoneId.set(null); }}
    >Xoá vùng</button>
  </div>
{/if}

<style>
  .zone-panel { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .head { display: flex; align-items: center; gap: 8px; }
  .head h3 { margin: 0; }
  /* Nút khoá dùng lại tông hổ phách của nút khoá item trong PropertiesPanel. */
  .lock {
    margin-left: auto; padding: 2px 6px; border-radius: 4px; font-size: 12px;
    border: 1px solid #e5e7eb; background: transparent; color: #6b7280; cursor: pointer;
  }
  .lock:hover { background: #f9fafb; }
  .lock.on { background: #fef3c7; border-color: #fbbf24; color: #b45309; }
  .stage-item { display: flex; align-items: center; gap: 6px; }
  .dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  button[disabled] { opacity: 0.45; cursor: not-allowed; }
</style>
