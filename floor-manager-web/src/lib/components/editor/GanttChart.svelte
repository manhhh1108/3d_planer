<script lang="ts">
  import { api, type ApiPlanItem, type ApiConflict } from '$lib/services/api';

  let { items = [], planId = null, conflicts = [], onItemsChanged = () => {} }: {
    items: ApiPlanItem[];
    planId: string | null;
    conflicts: ApiConflict[];
    onItemsChanged: () => void;
  } = $props();

  const DAY_MS = 86400000;
  const DAY_WIDTH = 32;
  const ROW_HEIGHT = 40;
  const HEADER_HEIGHT = 48;
  const LABEL_WIDTH = 120;

  // Local copy for drag visual feedback (avoid mutating prop directly)
  let localItems = $state<ApiPlanItem[]>([]);
  $effect(() => { localItems = [...items]; });

  function getDateRange() {
    const src = localItems.length > 0 ? localItems : items;
    if (src.length === 0) {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      return { start, end };
    }
    const starts = src.map(i => new Date(i.startDate).getTime());
    const ends = src.map(i => new Date(i.endDate).getTime());
    const minStart = new Date(Math.min(...starts));
    const maxEnd = new Date(Math.max(...ends));
    minStart.setDate(minStart.getDate() - 7);
    maxEnd.setDate(maxEnd.getDate() + 14);
    return { start: minStart, end: maxEnd };
  }

  let dateRange = $derived(getDateRange());
  let totalDays = $derived(Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / DAY_MS));
  let chartWidth = $derived(totalDays * DAY_WIDTH + LABEL_WIDTH);

  function getRows() {
    const src = localItems.length > 0 ? localItems : items;
    const map = new Map<string, { productName: string; productCode: string; color: string; items: ApiPlanItem[] }>();
    for (const item of src) {
      const key = item.productId;
      if (!map.has(key)) {
        map.set(key, {
          productName: item.product?.name ?? '?',
          productCode: item.product?.code ?? '?',
          color: item.product?.color ?? '#58a6ff',
          items: [],
        });
      }
      map.get(key)!.items.push(item);
    }
    return [...map.values()];
  }

  let rows = $derived(getRows());
  let conflictedIds = $derived(new Set(conflicts.flatMap(c => [c.itemA.id, c.itemB.id])));

  function dayOffset(dateStr: string): number {
    return (new Date(dateStr).getTime() - dateRange.start.getTime()) / DAY_MS;
  }

  function dayWidth(startStr: string, endStr: string): number {
    return (new Date(endStr).getTime() - new Date(startStr).getTime()) / DAY_MS;
  }

  function formatDate(d: Date): string {
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  function getHeaderDates() {
    const dates: { date: Date; x: number }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(dateRange.start);
      d.setDate(d.getDate() + i);
      if (d.getDay() === 1 || i === 0) {
        dates.push({ date: d, x: i * DAY_WIDTH + LABEL_WIDTH });
      }
    }
    return dates;
  }

  let headerDates = $derived(getHeaderDates());

  // Drag state
  let dragItemId = $state<string | null>(null);
  let dragStartX = $state(0);
  let dragOrigStart = $state('');
  let dragOrigEnd = $state('');

  function onBarMouseDown(e: MouseEvent, item: ApiPlanItem, type: 'move' | 'resize-start' | 'resize-end') {
    e.preventDefault();
    e.stopPropagation();
    dragItemId = item.id;
    dragStartX = e.clientX;
    dragOrigStart = item.startDate;
    dragOrigEnd = item.endDate;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartX;
      const daysDelta = Math.round(dx / DAY_WIDTH);
      if (daysDelta === 0) return;

      const origStart = new Date(dragOrigStart);
      const origEnd = new Date(dragOrigEnd);

      if (type === 'move') {
        origStart.setDate(origStart.getDate() + daysDelta);
        origEnd.setDate(origEnd.getDate() + daysDelta);
      } else if (type === 'resize-start') {
        origStart.setDate(origStart.getDate() + daysDelta);
        if (origStart >= origEnd) return;
      } else {
        origEnd.setDate(origEnd.getDate() + daysDelta);
        if (origStart >= origEnd) return;
      }

      // Update local copy for visual feedback
      localItems = localItems.map(i =>
        i.id === item.id
          ? { ...i, startDate: origStart.toISOString().slice(0, 10), endDate: origEnd.toISOString().slice(0, 10) }
          : i
      );
    };

    const onMouseUp = async () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (!dragItemId) return;

      const updated = localItems.find(i => i.id === dragItemId);
      if (updated && (updated.startDate !== dragOrigStart || updated.endDate !== dragOrigEnd)) {
        await api.plans.updateItem(dragItemId, {
          startDate: updated.startDate,
          endDate: updated.endDate,
        });
        onItemsChanged();
      }
      dragItemId = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // Drop modal state
  let showDropModal = $state(false);
  let dropProductId = $state('');
  let dropStartDate = $state('');
  let dropEndDate = $state('');
  let dropX = $state(10);
  let dropY = $state(10);

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    const productId = e.dataTransfer?.getData('text/plan-product-id');
    if (!productId || !planId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left - LABEL_WIDTH;
    const dayIndex = Math.floor(x / DAY_WIDTH);
    const startDate = new Date(dateRange.start);
    startDate.setDate(startDate.getDate() + dayIndex);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    dropProductId = productId;
    dropStartDate = startDate.toISOString().slice(0, 10);
    dropEndDate = endDate.toISOString().slice(0, 10);
    dropX = 10;
    dropY = 10;
    showDropModal = true;
  }

  async function confirmDrop() {
    if (!planId || !dropProductId) return;
    await api.plans.createItem(planId, {
      productId: dropProductId,
      x: dropX,
      y: dropY,
      startDate: dropStartDate,
      endDate: dropEndDate,
    });
    showDropModal = false;
    onItemsChanged();
  }

  async function deleteItem(id: string) {
    await api.plans.removeItem(id);
    onItemsChanged();
  }

  const STAGE_COLORS: Record<string, string> = {
    'Hàn': '#f59e0b',
    'Sơn': '#22c55e',
    'Lắp ráp': '#3b82f6',
    'Cắt': '#ef4444',
    'Khác': '#6b7280',
  };
</script>

<div
  class="relative overflow-auto bg-white flex-1"
  ondragover={(e) => e.preventDefault()}
  ondrop={onDrop}
  role="presentation"
>
  {#if items.length === 0 && planId}
    <div class="flex items-center justify-center h-full min-h-[200px] text-gray-400 text-sm">
      Kéo sản phẩm từ danh sách bên trái vào đây để tạo kế hoạch
    </div>
  {:else if items.length > 0}
    <div style="width: {chartWidth}px; min-width: 100%">
      <!-- Header -->
      <div class="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 flex" style="height: {HEADER_HEIGHT}px">
        <div class="shrink-0 border-r border-gray-200 bg-gray-50 flex items-center px-2 text-[10px] text-gray-400 font-semibold uppercase" style="width: {LABEL_WIDTH}px">Sản phẩm</div>
        <div class="relative flex-1">
          {#each headerDates as hd}
            <div class="absolute top-0 text-[10px] text-gray-400 font-medium px-1 border-l border-gray-100" style="left: {hd.x - LABEL_WIDTH}px; height: {HEADER_HEIGHT}px; line-height: {HEADER_HEIGHT}px">
              {formatDate(hd.date)}
            </div>
          {/each}
        </div>
      </div>

      <!-- Rows -->
      {#each rows as row}
        <div class="flex border-b border-gray-100" style="height: {ROW_HEIGHT}px">
          <div class="shrink-0 border-r border-gray-200 bg-white px-2 flex items-center gap-1.5 text-xs font-medium text-gray-700" style="width: {LABEL_WIDTH}px">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background: {row.color}"></span>
            <span class="truncate">{row.productCode}</span>
          </div>
          <div class="relative flex-1">
            {#each row.items as item}
              {@const left = dayOffset(item.startDate) * DAY_WIDTH}
              {@const width = dayWidth(item.startDate, item.endDate) * DAY_WIDTH}
              {@const isConflicted = conflictedIds.has(item.id)}
              {@const stageColor = STAGE_COLORS[item.product?.processStage ?? 'Khác'] ?? '#6b7280'}
              <div
                class="absolute top-1 rounded-md flex items-center text-[10px] text-white font-medium px-1 cursor-grab select-none group"
                class:ring-2={isConflicted}
                class:ring-red-500={isConflicted}
                class:animate-pulse={isConflicted}
                style="left: {left}px; width: {Math.max(width, 8)}px; height: {ROW_HEIGHT - 8}px; background: {stageColor}"
                onmousedown={(e) => onBarMouseDown(e, item, 'move')}
                title="{item.product?.name}: {item.startDate} → {item.endDate}"
                role="button"
                tabindex="0"
              >
                <!-- Resize left -->
                <div
                  class="absolute left-0 top-0 w-2 h-full cursor-w-resize"
                  onmousedown={(e) => { e.stopPropagation(); onBarMouseDown(e, item, 'resize-start'); }}
                  role="presentation"
                ></div>

                <span class="truncate flex-1 px-0.5">{item.product?.name ?? '?'}</span>

                <!-- Delete -->
                <button
                  class="opacity-0 group-hover:opacity-100 ml-0.5 w-4 h-4 rounded bg-black/30 text-white text-[8px] flex items-center justify-center hover:bg-black/50 shrink-0"
                  onclick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                  title="Xoá"
                >x</button>

                <!-- Resize right -->
                <div
                  class="absolute right-0 top-0 w-2 h-full cursor-e-resize"
                  onmousedown={(e) => { e.stopPropagation(); onBarMouseDown(e, item, 'resize-end'); }}
                  role="presentation"
                ></div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Drop modal (thay thế prompt) -->
{#if showDropModal}
  <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onclick={() => showDropModal = false} role="presentation">
    <div class="bg-white rounded-xl shadow-xl p-5 w-80" onclick={(e) => e.stopPropagation()} role="dialog">
      <h3 class="text-sm font-semibold text-gray-800 mb-4">Thêm vào kế hoạch</h3>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-gray-500">X (mét)</label>
            <input type="number" bind:value={dropX} step="0.5" class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </div>
          <div>
            <label class="text-xs text-gray-500">Y (mét)</label>
            <input type="number" bind:value={dropY} step="0.5" class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-gray-500">Bắt đầu</label>
            <input type="date" bind:value={dropStartDate} class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </div>
          <div>
            <label class="text-xs text-gray-500">Kết thúc</label>
            <input type="date" bind:value={dropEndDate} class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button onclick={() => showDropModal = false} class="px-3 py-1.5 text-xs text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200">Huỷ</button>
        <button onclick={confirmDrop} class="px-3 py-1.5 text-xs text-white bg-blue-500 rounded-lg hover:bg-blue-600 font-semibold">Thêm</button>
      </div>
    </div>
  </div>
{/if}
