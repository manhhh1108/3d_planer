<script lang="ts">
  import { api, type ApiCompareItem, type ApiPlan } from '$lib/services/api';

  let { layoutId = '', show = false, onClose = () => {} }: {
    layoutId: string;
    show: boolean;
    onClose: () => void;
  } = $props();

  let plans = $state<ApiPlan[]>([]);
  let selectedPlanId = $state<string | null>(null);
  let items = $state<ApiCompareItem[]>([]);
  let summary = $state({ matched: 0, misplaced: 0, missing: 0, unplanned: 0 });
  let resultSnapshotDate = $state<string | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (show && layoutId) {
      loadPlans();
    }
  });

  async function loadPlans() {
    plans = await api.plans.list(layoutId);
    if (plans.length > 0 && !selectedPlanId) {
      // Chọn kế hoạch đang hoạt động, hoặc kế hoạch đầu tiên
      const active = plans.find(p => p.active);
      selectedPlanId = active?.id ?? plans[0].id;
      await compare();
    }
  }

  async function compare() {
    if (!selectedPlanId) return;
    loading = true;
    error = null;
    try {
      const result = await api.plans.compare(selectedPlanId, undefined);
      items = result.items;
      summary = result.summary;
      resultSnapshotDate = result.snapshotDate;
    } catch (e) {
      error = 'Không thể tải dữ liệu so sánh';
      items = [];
      summary = { matched: 0, misplaced: 0, missing: 0, unplanned: 0 };
    } finally {
      loading = false;
    }
  }

  const STATUS_CONFIG = {
    matched: { label: 'Đúng vị trí', color: 'text-green-600', bg: 'bg-green-50', icon: '✓', border: 'border-green-300' },
    misplaced: { label: 'Lệch vị trí', color: 'text-amber-600', bg: 'bg-amber-50', icon: '⇄', border: 'border-amber-300' },
    missing: { label: 'Chưa vào', color: 'text-red-600', bg: 'bg-red-50', icon: '✗', border: 'border-red-300' },
    unplanned: { label: 'Ngoài kế hoạch', color: 'text-blue-600', bg: 'bg-blue-50', icon: '?', border: 'border-blue-300' },
  };
</script>

{#if show}
  <div class="absolute top-0 right-0 z-30 w-72 h-full bg-white border-l border-gray-200 shadow-lg flex flex-col overflow-hidden">
    <!-- Tiêu đề -->
    <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-gray-800">So sánh KH vs TT</h3>
        <button onclick={onClose} class="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>

      <!-- Chọn kế hoạch -->
      {#if plans.length > 0}
        <select
          class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white outline-none focus:border-blue-400 mb-2"
          value={selectedPlanId}
          onchange={(e) => { selectedPlanId = (e.target as HTMLSelectElement).value; compare(); }}
        >
          {#each plans as plan}
            <option value={plan.id}>{plan.name}</option>
          {/each}
        </select>
      {/if}

      {#if resultSnapshotDate}
        <p class="text-[10px] text-gray-400">Snapshot: {resultSnapshotDate}</p>
      {/if}
    </div>

    <!-- Tóm tắt -->
    {#if !loading && items.length > 0}
      <div class="grid grid-cols-4 gap-1 px-3 py-2 border-b border-gray-100">
        <div class="text-center">
          <div class="text-base font-bold text-green-600">{summary.matched}</div>
          <div class="text-[9px] text-gray-400">Đúng</div>
        </div>
        <div class="text-center">
          <div class="text-base font-bold text-amber-600">{summary.misplaced}</div>
          <div class="text-[9px] text-gray-400">Lệch</div>
        </div>
        <div class="text-center">
          <div class="text-base font-bold text-red-600">{summary.missing}</div>
          <div class="text-[9px] text-gray-400">Thiếu</div>
        </div>
        <div class="text-center">
          <div class="text-base font-bold text-blue-600">{summary.unplanned}</div>
          <div class="text-[9px] text-gray-400">Thừa</div>
        </div>
      </div>
    {/if}

    <!-- Danh sách mục -->
    <div class="flex-1 overflow-auto">
      {#if loading}
        <div class="flex items-center justify-center h-32 text-gray-400 text-sm">Đang tải...</div>
      {:else if error}
        <div class="p-4 text-sm text-red-500">{error}</div>
      {:else if items.length === 0}
        <div class="flex items-center justify-center h-32 text-gray-400 text-sm">Không có dữ liệu</div>
      {:else}
        <div class="divide-y divide-gray-100">
          {#each items as item}
            {@const cfg = STATUS_CONFIG[item.status]}
            <div class="px-3 py-2.5 flex items-start gap-2 {cfg.bg}/50">
              <span class="w-5 h-5 rounded flex items-center justify-center text-xs font-bold {cfg.color} {cfg.bg} shrink-0 mt-0.5">{cfg.icon}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1">
                  <span class="text-xs font-semibold text-gray-800 truncate">{item.productCode}</span>
                  <span class="text-[10px] text-gray-400 truncate">{item.productName}</span>
                </div>
                <div class="text-[10px] text-gray-500 mt-0.5">
                  {#if item.status === 'matched'}
                    Vị trí ({item.actual?.x}, {item.actual?.y}) — đúng kế hoạch
                  {:else if item.status === 'misplaced'}
                    TT: ({item.actual?.x}, {item.actual?.y}) → KH: ({item.planned?.x}, {item.planned?.y}) · lệch {item.distanceM}m
                  {:else if item.status === 'missing'}
                    KH: ({item.planned?.x}, {item.planned?.y}) — chưa có trên mặt bằng
                  {:else}
                    TT: ({item.actual?.x}, {item.actual?.y}) — không có trong kế hoạch
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Nút làm mới -->
    <div class="px-3 py-2 border-t border-gray-200">
      <button onclick={compare} disabled={loading || !selectedPlanId} class="w-full px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 disabled:opacity-40">
        Làm mới
      </button>
    </div>
  </div>
{/if}
