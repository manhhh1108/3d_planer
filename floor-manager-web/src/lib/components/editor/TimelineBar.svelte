<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type ApiSnapshot } from '$lib/services/api';
  import { positionToItem, todayStr } from '$lib/services/mapping';
  import { currentProject } from '$lib/stores/project';
  import { timelineDate } from '$lib/stores/timeline';
  import { markClean, lastSavedAt, resetWorkingDate, workingDate } from '$lib/stores/saveStatus';
  import { backendStore } from '$lib/services/datastore';

  let { layoutId }: { layoutId: string } = $props();

  let snapshots = $state<ApiSnapshot[]>([]);
  let loading = $state(false);

  async function refresh() {
    try {
      const list = await api.snapshots.list(layoutId);
      // API trả desc theo ngày -> đảo lại tăng dần cho timeline
      snapshots = [...list].reverse();
    } catch (e) {
      console.error('[Timeline] Không tải được danh sách snapshot:', e);
    }
  }

  onMount(refresh);
  // Lưu snapshot xong -> ngày mới xuất hiện trên timeline
  lastSavedAt.subscribe((t) => { if (t) refresh(); });

  function dateOf(s: ApiSnapshot): string {
    return s.date.slice(0, 10);
  }

  function fmt(d: string): string {
    return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  }

  /** Thay toàn bộ vị trí block trên floor đang active bằng positions của snapshot */
  function applyPositions(snap: ApiSnapshot | null) {
    currentProject.update((p) => {
      if (!p) return p;
      const floor = p.floors.find((f) => f.id === p.activeFloorId) ?? p.floors[0];
      if (floor) floor.furniture = (snap?.positions ?? []).map(positionToItem);
      return { ...p };
    });
    markClean();
  }

  /** Ngày chưa tới thì còn sửa được; ngày đã qua là lịch sử, chỉ đọc */
  function isFuture(d: string): boolean {
    return d > todayStr();
  }

  async function viewDate(s: ApiSnapshot) {
    const d = dateOf(s);
    if (d === todayStr()) return backToToday();
    loading = true;
    try {
      const detail = await api.snapshots.get(s.id);
      if (isFuture(d)) {
        // Bố trí trước cho ngày sau: mở ở chế độ SỬA, và chốt ngày đích để mọi
        // lần lưu (kể cả tự lưu) ghi vào đúng ngày đó chứ không phải hôm nay.
        timelineDate.set(null);
        workingDate.set(d);
      } else {
        timelineDate.set(d);
        resetWorkingDate();
      }
      applyPositions(detail);
    } finally {
      loading = false;
    }
  }

  async function backToToday() {
    loading = true;
    try {
      timelineDate.set(null);
      resetWorkingDate();
      const project = await backendStore.load(layoutId);
      if (project) {
        currentProject.set(project);
        markClean();
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex items-center gap-2 px-4 py-2 bg-white border-t border-gray-200 shrink-0">
  <span class="text-xs font-medium text-gray-500 whitespace-nowrap">📅 Snapshot:</span>
  <div class="flex gap-1.5 flex-1 overflow-x-auto py-0.5">
    {#each snapshots as s}
      {@const d = dateOf(s)}
      {@const isToday = d === todayStr()}
      {@const isEditingFuture = $workingDate === d}
      {@const isActive = $timelineDate === d || isEditingFuture || (isToday && $timelineDate === null && $workingDate === null)}
      <button
        class="px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors
          {isToday
            ? (isActive ? 'bg-blue-600 text-white font-semibold' : 'bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200')
            : isActive
              ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
        onclick={() => viewDate(s)}
        disabled={loading}
        title={s.note ?? d}
      >{fmt(d)}{isToday ? ' · Hôm nay' : ''}{isEditingFuture ? ' · đang soạn' : ''}</button>
    {/each}
    {#if snapshots.length === 0}
      <span class="text-xs text-gray-400 italic">Chưa có snapshot — bấm "Lưu Snapshot" để chốt vị trí hôm nay</span>
    {/if}
  </div>
  {#if $workingDate}
    <div class="flex items-center gap-2 shrink-0">
      <span class="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5 whitespace-nowrap">
        ✎ Đang soạn cho {fmt($workingDate)} — sửa và lưu bình thường
      </span>
      <button
        class="px-3 py-1 rounded-full text-xs bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
        onclick={backToToday}
        disabled={loading}
      >Về hôm nay</button>
    </div>
  {:else if $timelineDate}
    <div class="flex items-center gap-2 shrink-0">
      <span class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 whitespace-nowrap">
        👁 Đang xem {fmt($timelineDate)} — chỉ đọc, phóng to và kéo xem được
      </span>
      <button
        class="px-3 py-1 rounded-full text-xs bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
        onclick={backToToday}
        disabled={loading}
      >← Về hôm nay</button>
    </div>
  {/if}
</div>
