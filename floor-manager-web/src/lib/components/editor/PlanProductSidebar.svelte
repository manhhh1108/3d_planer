<script lang="ts">
  import { api, type ApiProduct } from '$lib/services/api';
  import { currentProject } from '$lib/stores/project';

  let { projectId = '' }: { projectId: string } = $props();

  let products = $state<ApiProduct[]>([]);
  let loading = $state(false);
  let search = $state('');

  $effect(() => {
    if (projectId) loadProducts();
  });

  async function loadProducts() {
    loading = true;
    try {
      products = await api.products.list(projectId);
    } finally {
      loading = false;
    }
  }

  let filtered = $derived(
    search
      ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()))
      : products
  );

  const STAGE_COLORS: Record<string, string> = {
    'Hàn': '#f59e0b',
    'Sơn': '#22c55e',
    'Lắp ráp': '#3b82f6',
    'Cắt': '#ef4444',
    'Khác': '#6b7280',
  };

  function stageColor(p: ApiProduct) {
    return STAGE_COLORS[p.processStage ?? 'Khác'] ?? p.color ?? '#6b7280';
  }

  function onDragStart(e: DragEvent, product: ApiProduct) {
    e.dataTransfer!.effectAllowed = 'copy';
    e.dataTransfer!.setData('text/plan-product-id', product.id);
  }
</script>

<div class="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
  <div class="px-3 py-2.5 border-b border-gray-200">
    <p class="text-[10px] font-semibold text-gray-400 uppercase mb-2">Sản phẩm</p>
    <input
      type="search"
      placeholder="Tìm..."
      bind:value={search}
      class="w-full px-2 py-1 text-xs border border-gray-200 rounded-md outline-none focus:border-blue-400"
    />
  </div>

  <div class="flex-1 overflow-y-auto p-2 space-y-1">
    {#if loading}
      <p class="text-xs text-gray-400 text-center py-4">Đang tải...</p>
    {:else if filtered.length === 0}
      <p class="text-xs text-gray-400 text-center py-4">Không có sản phẩm</p>
    {:else}
      {#each filtered as product}
        <div
          class="flex items-center gap-2 px-2 py-2 rounded-lg cursor-grab hover:bg-gray-50 border border-transparent hover:border-gray-200 select-none"
          draggable="true"
          ondragstart={(e) => onDragStart(e, product)}
          title="Kéo vào Gantt để thêm vào kế hoạch"
          role="button"
          tabindex="0"
        >
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:{stageColor(product)}"></span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-gray-800 truncate">{product.name}</p>
            <p class="text-[10px] text-gray-400 truncate">{product.code}</p>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="px-3 py-2 border-t border-gray-100 text-[10px] text-gray-400 text-center">
    Kéo vào Gantt để lên lịch
  </div>
</div>
