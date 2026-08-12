<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { api, type ApiSite } from '$lib/services/api';

  const siteId = $page.params.id ?? '';

  let site = $state<ApiSite | null>(null);
  let loading = $state(true);

  let showCreateLayout = $state(false);
  let newLayoutName = $state('');
  let newLayoutW = $state(100);
  let newLayoutH = $state(60);
  let confirmDeleteId = $state<string | null>(null);

  async function refresh() {
    loading = true;
    try {
      site = await api.sites.get(siteId);
    } finally {
      loading = false;
    }
  }

  onMount(refresh);

  async function createLayout() {
    if (!newLayoutName.trim() || newLayoutW <= 0 || newLayoutH <= 0) return;
    const layout = await api.layouts.create({
      siteId,
      name: newLayoutName.trim(),
      widthM: newLayoutW,
      heightM: newLayoutH,
    });
    showCreateLayout = false;
    newLayoutName = '';
    goto(`${base}/editor?layoutId=${layout.id}`);
  }

  async function deleteLayout(id: string) {
    await api.layouts.remove(id);
    confirmDeleteId = null;
    await refresh();
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <div class="bg-gradient-to-r from-slate-800 to-slate-700 shadow-sm">
    <div class="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
      <a href={base || '/'} class="flex items-center gap-1 text-white/70 hover:text-white text-sm transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        Trang chủ
      </a>
      <div class="h-5 w-px bg-white/20"></div>
      <div class="flex-1 min-w-0">
        <h1 class="text-xl font-bold text-white truncate">🏭 {site?.name ?? '...'}</h1>
        {#if site?.address}
          <p class="text-xs text-white/50 truncate">{site.address}</p>
        {/if}
      </div>
    </div>
  </div>

  <div class="max-w-5xl mx-auto px-6 py-8">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-base font-bold text-gray-800">Layout ({site?.layouts?.length ?? 0})</h2>
      <button onclick={() => showCreateLayout = true} class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">
        + Thêm layout
      </button>
    </div>

    {#if loading}
      <div class="text-center py-16 text-gray-400">Đang tải...</div>
    {:else if !site || (site.layouts?.length ?? 0) === 0}
      <div class="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
        <div class="text-4xl mb-3">🗺</div>
        <p class="text-gray-400 font-medium">Chưa có layout nào</p>
        <p class="text-sm text-gray-400 mt-1">Thêm layout (bãi chứa, khu xưởng...) để bắt đầu bố trí block</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each site.layouts ?? [] as layout}
          <div class="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-200 transition-all relative">
            <a href={`${base}/editor?layoutId=${layout.id}`} class="block">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-lg">🗺</div>
                <div class="min-w-0">
                  <h3 class="font-semibold text-gray-800 truncate">{layout.name}</h3>
                  <p class="text-xs text-gray-400">{layout.widthM} × {layout.heightM} m · {layout._count?.snapshots ?? 0} snapshot</p>
                </div>
              </div>
              <div class="mt-3 text-xs text-blue-600 font-medium">Mở editor →</div>
            </a>
            {#if confirmDeleteId === layout.id}
              <div class="absolute top-3 right-3 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1.5 flex items-center gap-2 z-10">
                <span class="text-xs text-gray-500">Xóa?</span>
                <button onclick={() => deleteLayout(layout.id)} class="px-2 py-0.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">Có</button>
                <button onclick={() => confirmDeleteId = null} class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300">Không</button>
              </div>
            {:else}
              <button
                onclick={() => confirmDeleteId = layout.id}
                class="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                title="Xóa layout" aria-label="Xóa layout"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Create layout modal -->
  {#if showCreateLayout}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={() => showCreateLayout = false} onkeydown={(e) => { if (e.key === 'Escape') showCreateLayout = false; }} role="dialog" tabindex="-1">
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <h2 class="text-lg font-bold text-gray-800 mb-4">Thêm layout</h2>
        <label class="block mb-3">
          <span class="text-xs font-medium text-gray-500">Tên layout *</span>
          <input type="text" bind:value={newLayoutName} placeholder="VD: Bãi A, Khu xưởng 1..."
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            onkeydown={(e) => { if (e.key === 'Enter') createLayout(); }} />
        </label>
        <div class="grid grid-cols-2 gap-3 mb-5">
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Chiều rộng (m)</span>
            <input type="number" bind:value={newLayoutW} min="1" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Chiều dài (m)</span>
            <input type="number" bind:value={newLayoutH} min="1" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </label>
        </div>
        <div class="flex gap-2 justify-end">
          <button onclick={() => showCreateLayout = false} class="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
          <button onclick={createLayout} disabled={!newLayoutName.trim()} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">Tạo & mở editor</button>
        </div>
      </div>
    </div>
  {/if}
</div>
