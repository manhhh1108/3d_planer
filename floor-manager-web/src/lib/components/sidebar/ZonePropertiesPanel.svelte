<script lang="ts">
  import { currentProject, activeFloor, selectedZoneId, updateZone, removeZone, revalidateZones } from '$lib/stores/project';
  import { stages, loadStages } from '$lib/stores/stages';
  import { polygonArea } from '$lib/utils/zoneGeometry';
  import type { WorkingZone } from '$lib/models/types';

  // Nội dung thuộc tính vùng. Khung (vị trí, độ rộng, cuộn) do PropertiesPanel
  // lo, giống hệt item — trước đây panel này tự chen vào hàng flex nên mỗi lần
  // chọn/bỏ chọn vùng là canvas co giãn theo.

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
  <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
    <span class="w-6 h-6 bg-sky-100 rounded flex items-center justify-center text-xs">▱</span>
    Vùng
    <button
      onclick={() => updateZone(zone!.id, { locked: !zone!.locked })}
      class="ml-auto px-1.5 py-0.5 rounded text-xs border transition-colors {zone.locked ? 'bg-amber-100 border-amber-400 text-amber-700' : 'border-gray-200 hover:bg-gray-50 text-gray-500'}"
      title={zone.locked ? 'Bỏ khoá để sửa hình vùng' : 'Khoá để khỏi lỡ tay kéo lệch'}
    >{zone.locked ? '🔒 Đã khoá' : '🔓'}</button>
  </h3>

  <div class="space-y-3">
    <label class="block">
      <span class="text-xs text-gray-500">Tên vùng</span>
      <!-- Viền + nền + vòng focus rõ ràng: không có class thì Tailwind preflight
           xoá sạch viền mặc định, ô nhập tàng hình giữa bảng trắng. -->
      <input
        value={zone.name ?? ''}
        placeholder="Nhập tên vùng…"
        onchange={(e) => { updateZone(zone!.id, { name: (e.currentTarget as HTMLInputElement).value }); revalidateZones(); }}
        class="w-full mt-0.5 px-2 py-1.5 border border-gray-300 rounded text-sm bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      />
    </label>

    <div class="text-xs text-gray-500">
      Diện tích: <strong class="text-sm text-gray-800">{areaM2.toFixed(2)} m²</strong>
    </div>

    <div>
      <div class="text-xs text-gray-500 mb-1">Công đoạn được phép</div>
      <div class="space-y-1">
        {#each $stages as st (st.id)}
          <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={zone.allowedStageIds.includes(st.id)} onchange={() => toggleStage(st.id)} />
            <span class="w-3 h-3 rounded-sm inline-block" style={`background:${st.color}`}></span>{st.name}
          </label>
        {/each}
      </div>
    </div>

    <button
      disabled={zone.locked}
      title={zone.locked ? 'Vùng đang khoá — bỏ khoá để xoá' : ''}
      onclick={() => { removeZone(zone!.id); selectedZoneId.set(null); }}
      class="w-full px-2 py-1.5 border rounded text-sm transition-colors {zone.locked ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-red-200 text-red-600 hover:bg-red-50'}"
    >Xoá vùng</button>
  </div>
{/if}
