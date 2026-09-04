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
    <h3>Vùng</h3>
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
    <button onclick={() => { removeZone(zone!.id); selectedZoneId.set(null); }}>Xoá vùng</button>
  </div>
{/if}

<style>
  .zone-panel { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .stage-item { display: flex; align-items: center; gap: 6px; }
  .dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
</style>
