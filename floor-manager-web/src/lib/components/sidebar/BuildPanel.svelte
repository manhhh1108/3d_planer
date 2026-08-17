<script lang="ts">
  import { selectedTool, placingFurnitureId, setBackgroundImage, activeFloor } from '$lib/stores/project';
  import type { Tool } from '$lib/stores/project';
  import type { FurnitureDef } from '$lib/utils/furnitureCatalog';
  import { getModelFile, getThumbnail } from '$lib/utils/furnitureThumbnails';
  import { productCatalog } from '$lib/stores/productCatalog';

  let activeTab = $state<'draw' | 'objects'>('objects');
  let selectedCategory = $state<string>('All');
  let thumbsReady = $state(0); // increment to trigger reactivity

  let catalogItems = $derived($productCatalog);
  let categories = $derived([...new Set($productCatalog.map((f) => f.category))]);

  const placedCounts = $derived(
    ($activeFloor?.furniture ?? []).reduce<Record<string, number>>((acc, fi) => {
      acc[fi.catalogId] = (acc[fi.catalogId] ?? 0) + 1;
      return acc;
    }, {})
  );

  function setTool(tool: Tool) {
    selectedTool.set(tool);
    placingFurnitureId.set(null);
  }

  let currentTool = $state<Tool>('select');
  selectedTool.subscribe((t) => { currentTool = t; });

  let currentPlacing = $state<string | null>(null);
  placingFurnitureId.subscribe((id) => { currentPlacing = id; });

  function onFurnitureClick(item: FurnitureDef) {
    const placed = placedCounts[item.id] ?? 0;
    const qty = item.quantity ?? 1;
    if (placed >= qty) return; // quantity limit reached
    selectedTool.set('furniture');
    placingFurnitureId.set(item.id);
    addToRecent(item.id);
  }

  let search = $state('');

  // --- Recent Items (localStorage) ---
  const RECENT_KEY = 'o3d_recent_furniture';
  const MAX_RECENT = 10;
  let recentIds = $state<string[]>((() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  })());

  function addToRecent(id: string) {
    recentIds = [id, ...recentIds.filter(r => r !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds));
  }

  let recentItems = $derived(
    recentIds.map(id => catalogItems.find(f => f.id === id)).filter(Boolean) as FurnitureDef[]
  );

  // --- Favorites (localStorage) ---
  const FAV_KEY = 'o3d_favorite_furniture';
  let favoriteIds = $state<string[]>((() => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
  })());

  function toggleFavorite(id: string) {
    if (favoriteIds.includes(id)) {
      favoriteIds = favoriteIds.filter(f => f !== id);
    } else {
      favoriteIds = [...favoriteIds, id];
    }
    localStorage.setItem(FAV_KEY, JSON.stringify(favoriteIds));
  }

  let favoriteItems = $derived(
    favoriteIds.map(id => catalogItems.find(f => f.id === id)).filter(Boolean) as FurnitureDef[]
  );

  let filtered = $derived(
    (() => {
      const s = search.toLowerCase();
      let items = selectedCategory === 'Favorites'
        ? favoriteItems
        : catalogItems.filter((f) => {
            const matchCat = selectedCategory === 'All' || f.category === selectedCategory;
            return matchCat;
          });
      if (s) {
        items = items.filter(f => f.name.toLowerCase().includes(s));
      }
      return items;
    })()
  );

  function onImportImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        alert('Warning: Image is larger than 5MB. This may slow down the application.');
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setBackgroundImage({
          dataUrl,
          position: { x: 0, y: 0 },
          scale: 1,
          opacity: 0.4,
          rotation: 0,
          locked: false,
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  // --- Hover Preview Tooltip ---
  let hoveredItem = $state<FurnitureDef | null>(null);
  let hoverTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  let hoverPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });
  let showPreview = $state(false);

  function onItemMouseEnter(e: MouseEvent, item: FurnitureDef) {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoveredItem = item;
    updateHoverPos(e);
    hoverTimeout = setTimeout(() => { showPreview = true; }, 300);
  }

  function onItemMouseMove(e: MouseEvent) {
    updateHoverPos(e);
  }

  function onItemMouseLeave() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = null;
    showPreview = false;
    hoveredItem = null;
  }

  function updateHoverPos(e: MouseEvent) {
    const sidebarRight = 256; // w-64 = 16rem = 256px
    const viewportW = window.innerWidth;
    const tooltipW = 220;
    // Position to the right of sidebar, or left if no space
    const x = (sidebarRight + tooltipW + 8) < viewportW ? sidebarRight + 8 : -tooltipW - 8;
    // Vertically align near the mouse, clamped to viewport
    const y = Math.min(Math.max(e.clientY - 40, 8), window.innerHeight - 200);
    hoverPos = { x, y };
  }

  const categoryColors: Record<string, string> = {
    'Sản phẩm': '#2563eb',
    'Thiết bị': '#7e22ce',
  };
</script>

<div class="w-64 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
  <!-- Tabs -->
  <div class="flex border-b border-gray-200">
    <button
      class="flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide {activeTab === 'draw' ? 'text-slate-800 border-b-2 border-blue-500 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}"
      onclick={() => activeTab = 'draw'}
    >Tools</button>
    <button
      class="flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide {activeTab === 'objects' ? 'text-slate-800 border-b-2 border-blue-500 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}"
      onclick={() => activeTab = 'objects'}
    >Products</button>
  </div>

  <div class="flex-1 overflow-y-auto p-3">
    {#if activeTab === 'draw'}
      <div class="space-y-1">
        <h3 class="text-xs font-semibold text-gray-400 uppercase mb-2">Tools</h3>
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'select' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
          onclick={() => setTool('select')}
        >
          <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'select' ? 'bg-blue-100' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
          </div>
          <div class="text-left">
            <div class="font-medium">Select <span class="text-gray-400 text-xs ml-1">V</span></div>
            <div class="text-xs text-gray-400">Click to select elements</div>
          </div>
        </button>
        <h3 class="text-xs font-semibold text-gray-400 uppercase mb-2 mt-3">Annotate</h3>
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'text' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
          onclick={() => setTool('text')}
        >
          <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'text' ? 'bg-blue-100' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>
          </div>
          <div class="text-left">
            <div class="font-medium">Text Label</div>
            <div class="text-xs text-gray-400">Add text annotations (T)</div>
          </div>
        </button>

        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'annotate' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
          onclick={() => setTool('annotate')}
        >
          <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'annotate' ? 'bg-blue-100' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><line x1="16" y1="5" x2="22" y2="5"/><line x1="19" y1="2" x2="19" y2="8"/><line x1="3" y1="12" x2="12" y2="12"/></svg>
          </div>
          <div class="text-left">
            <div class="font-medium">Dimension</div>
            <div class="text-xs text-gray-400">Add dimension annotations (N)</div>
          </div>
        </button>
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'measure' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
          onclick={() => setTool('measure')}
        >
          <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'measure' ? 'bg-blue-100' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h5l2-7 4 14 2-7h7"/></svg>
          </div>
          <div class="text-left">
            <div class="font-medium">Measure</div>
            <div class="text-xs text-gray-400">Measure distances (M)</div>
          </div>
        </button>

        <h3 class="text-xs font-semibold text-gray-400 uppercase mb-2 mt-3">Import</h3>
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-gray-50 text-gray-700"
          onclick={onImportImage}
        >
          <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
          </div>
          <div class="text-left">
            <div class="font-medium">Import Image</div>
            <div class="text-xs text-gray-400">Floor plan background</div>
          </div>
        </button>
      </div>

    {:else if activeTab === 'objects'}
      <div class="space-y-2">
        <!-- Search with clear button and result count -->
        <div class="relative">
          <input
            type="text"
            placeholder="Tìm sản phẩm..."
            class="w-full px-3 py-2 pr-8 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            bind:value={search}
          />
          {#if search}
            <button
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100"
              onclick={() => search = ''}
              title="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          {/if}
        </div>
        {#if search}
          <div class="text-[10px] text-gray-400 px-1">{filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"</div>
        {/if}
        <!-- Category filter -->
        <div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          <button
            class="px-2 py-0.5 rounded-full text-[10px] font-medium {selectedCategory === 'All' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
            onclick={() => selectedCategory = 'All'}
          >All</button>
          <button
            class="px-2 py-0.5 rounded-full text-[10px] font-medium {selectedCategory === 'Favorites' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
            onclick={() => selectedCategory = 'Favorites'}
          >♥ Favorites{favoriteIds.length ? ` (${favoriteIds.length})` : ''}</button>
          {#each categories as cat}
            <button
              class="px-2 py-0.5 rounded-full text-[10px] font-medium {selectedCategory === cat ? 'text-white' : 'text-gray-600 hover:bg-gray-200'}"
              style={selectedCategory === cat ? `background-color: ${categoryColors[cat] ?? '#6b7280'}` : 'background-color: #f3f4f6'}
              onclick={() => selectedCategory = cat}
            >{cat}</button>
          {/each}
        </div>

        <!-- Recent Items -->
        {#if !search && selectedCategory === 'All' && recentItems.length > 0}
          <div class="mt-1">
            <h4 class="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Recent</h4>
            <div class="grid grid-cols-2 gap-2">
              {#each recentItems as item}
                <button
                  class="relative flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-colors cursor-grab active:cursor-grabbing {currentPlacing === item.id ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50'}"
                  onclick={() => onFurnitureClick(item)}
                  draggable="true"
                  ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'furniture'); e.dataTransfer?.setData('application/o3d-id', item.id); }}
                  onmouseenter={(e) => onItemMouseEnter(e, item)}
                  onmousemove={onItemMouseMove}
                  onmouseleave={onItemMouseLeave}
                >
                  <!-- svelte-ignore node_invalid_placement -->
                  <span
                    role="button"
                    tabindex="0"
                    class="absolute top-1 right-1 text-[12px] leading-none cursor-pointer {favoriteIds.includes(item.id) ? 'text-pink-500' : 'text-gray-300 hover:text-pink-400'}"
                    onclick={(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); toggleFavorite(item.id); }}
                    onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.stopPropagation(); toggleFavorite(item.id); } }}
                    title={favoriteIds.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >{favoriteIds.includes(item.id) ? '♥' : '♡'}</span>
                  {#if thumbsReady >= 0 && getModelFile(item.id) && getThumbnail(getModelFile(item.id)!)}
                    <img src={getThumbnail(getModelFile(item.id)!)} alt={item.name} class="w-10 h-10 object-contain" />
                  {:else}
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background-color: {item.color}20">
                      <div class="w-4 h-4 rounded-sm" style="background-color: {item.color}; opacity: 0.7"></div>
                    </div>
                  {/if}
                  <span class="text-[10px] font-medium text-gray-600 leading-tight text-center">{item.name}</span>
                </button>
              {/each}
            </div>
          </div>
          <hr class="border-gray-100" />
        {/if}

        <!-- Catalog grid -->
        <div class="grid grid-cols-2 gap-2 mt-2">
          {#each filtered as item}
            {@const s = search.toLowerCase()}
            {@const notReady = item.assetStatus != null && item.assetStatus !== 'ready'}
            {@const placed = placedCounts[item.id] ?? 0}
            {@const qty = item.quantity ?? 1}
            {@const isFull = placed >= qty}
            <button
              class="relative flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors {notReady || isFull ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} {currentPlacing === item.id ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50'}"
              onclick={() => { if (!notReady && !isFull) onFurnitureClick(item); }}
              disabled={notReady || isFull}
              draggable="true"
              ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'furniture'); e.dataTransfer?.setData('application/o3d-id', item.id); }}
              onmouseenter={(e) => onItemMouseEnter(e, item)}
              onmousemove={onItemMouseMove}
              onmouseleave={onItemMouseLeave}
            >
              <!-- svelte-ignore node_invalid_placement -->
              <span
                role="button"
                tabindex="0"
                class="absolute top-1 right-1 text-[12px] leading-none cursor-pointer {favoriteIds.includes(item.id) ? 'text-pink-500' : 'text-gray-300 hover:text-pink-400'}"
                onclick={(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); toggleFavorite(item.id); }}
                onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.stopPropagation(); toggleFavorite(item.id); } }}
                title={favoriteIds.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'}
              >{favoriteIds.includes(item.id) ? '♥' : '♡'}</span>
              {#if thumbsReady >= 0 && getModelFile(item.id) && getThumbnail(getModelFile(item.id)!)}
                <img src={getThumbnail(getModelFile(item.id)!)} alt={item.name} class="w-12 h-12 object-contain" />
              {:else}
                <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background-color: {item.color}20">
                  <div class="w-5 h-5 rounded-sm" style="background-color: {item.color}; opacity: 0.7"></div>
                </div>
              {/if}
              {#if s && item.name.toLowerCase().includes(s)}
                {@const idx = item.name.toLowerCase().indexOf(s)}
                <span class="text-xs font-medium text-gray-600">{item.name.slice(0, idx)}<mark class="bg-yellow-200 text-gray-800 rounded-sm px-0.5">{item.name.slice(idx, idx + s.length)}</mark>{item.name.slice(idx + s.length)}</span>
              {:else}
                <span class="text-xs font-medium text-gray-600">{item.name}</span>
              {/if}
              <span class="text-[10px] text-gray-400">{item.width}×{item.depth}cm</span>
              <span class="text-[10px] {isFull ? 'text-red-400 font-medium' : 'text-gray-400'}">{placed}/{qty}</span>
              {#if item.assetStatus === 'failed'}
                <span class="text-[10px] text-red-500">CAD lỗi</span>
              {:else if notReady}
                <span class="text-[10px] text-amber-500">Đang convert...</span>
              {/if}
            </button>
          {/each}
        </div>

      </div>
    {/if}
  </div>
</div>

<!-- Furniture Hover Preview Tooltip -->
{#if showPreview && hoveredItem}
  {@const item = hoveredItem}
  <div
    class="fixed z-50 pointer-events-none"
    style="left: {hoverPos.x}px; top: {hoverPos.y}px;"
  >
    <div class="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden" style="width: 220px;">
      <div class="w-full h-[120px] bg-gray-50 flex items-center justify-center p-3">
        {#if thumbsReady >= 0 && getModelFile(item.id) && getThumbnail(getModelFile(item.id)!)}
          <img src={getThumbnail(getModelFile(item.id)!)} alt={item.name} class="max-w-full max-h-full object-contain" style="image-rendering: auto;" />
        {:else}
          <div class="w-16 h-16 rounded-xl flex items-center justify-center" style="background-color: {item.color}20">
            <div class="w-10 h-10 rounded-md" style="background-color: {item.color}; opacity: 0.7"></div>
          </div>
        {/if}
      </div>
      <div class="p-3 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-gray-800">{item.name}</span>
          <span
            class="px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-white"
            style="background-color: {categoryColors[item.category] ?? '#6b7280'}"
          >{item.category}</span>
        </div>
        <div class="text-xs text-gray-500">
          {item.width} × {item.depth} × {item.height} cm
        </div>
      </div>
    </div>
  </div>
{/if}

