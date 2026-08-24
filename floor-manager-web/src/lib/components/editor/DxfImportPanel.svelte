<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/services/api';
  import type { DxfInsertData } from '$lib/services/api';
  import { furnitureCatalog } from '$lib/utils/furnitureCatalog';
  import { addFurniture } from '$lib/stores/project';

  let { layoutId, onClose }: { layoutId: string; onClose: () => void } = $props();

  let inserts = $state<DxfInsertData[]>([]);
  let loading = $state(true);
  let error = $state('');
  let importing = $state(false);
  let done = $state(false);

  // blockName → catalogId mapping chosen by user
  let mapping = $state<Record<string, string>>({});

  // Unique blocks with occurrence count and preview SVG
  let uniqueBlocks = $derived.by(() => {
    const map = new Map<string, { count: number; preview: string }>();
    for (const ins of inserts) {
      const cur = map.get(ins.blockName);
      map.set(ins.blockName, { count: (cur?.count ?? 0) + 1, preview: cur?.preview || ins.svgPreview });
    }
    return Array.from(map.entries()).map(([name, v]) => ({ name, count: v.count, preview: v.preview }));
  });

  let skippedMsg = $state<string | null>(null);
  let placedCount = $state(0);

  let importCount = $derived(
    inserts.filter(ins => !!mapping[ins.blockName]).length
  );

  onMount(async () => {
    try {
      inserts = await api.layouts.fetchInserts(layoutId);
    } catch (e: any) {
      error = e?.message ?? String(e);
    } finally {
      loading = false;
    }
  });

  function doImport() {
    importing = true;
    // File DXF có thể chứa nhiều bản hơn số lượng sản phẩm cho phép. Đặt tới
    // hạn mức rồi dừng, và nói rõ đã bỏ qua bao nhiêu thay vì âm thầm nuốt.
    let placed = 0;
    const skipped = new Map<string, number>();

    for (const ins of inserts) {
      const catalogId = mapping[ins.blockName];
      if (!catalogId) continue;
      if (addFurniture(catalogId, { x: ins.xCm, y: ins.yCm }, ins.rotationDeg)) {
        placed++;
      } else {
        skipped.set(ins.blockName, (skipped.get(ins.blockName) ?? 0) + 1);
      }
    }
    importing = false;
    placedCount = placed;
    done = true;
    if (skipped.size > 0) {
      const total = [...skipped.values()].reduce((a, b) => a + b, 0);
      const detail = [...skipped.entries()].map(([name, n]) => `${name} (${n})`).join(', ');
      skippedMsg = `Đã nhập ${placed} block. Bỏ qua ${total} vì vượt số lượng cho phép: ${detail}`;
      return; // giữ panel mở để người dùng đọc được
    }
    setTimeout(onClose, 800);
  }
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  aria-hidden="true"
></div>

<!-- Panel -->
<div class="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200">
    <div>
      <h2 class="text-base font-semibold text-slate-800">Nhập sản phẩm từ DXF</h2>
      {#if !loading && !error}
        <p class="text-xs text-slate-500 mt-0.5">
          {uniqueBlocks.length} loại block · {inserts.length} vị trí trong bản vẽ
        </p>
      {/if}
    </div>
    <button
      class="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
      onclick={onClose}
      aria-label="Đóng"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </div>

  <!-- Body -->
  <div class="flex-1 overflow-y-auto px-5 py-4">
    {#if loading}
      <p class="text-sm text-slate-500 text-center py-8">Đang đọc file DXF…</p>
    {:else if error}
      <p class="text-sm text-red-600 py-4">{error}</p>
    {:else if inserts.length === 0}
      <p class="text-sm text-slate-500 text-center py-8">Không tìm thấy block sản phẩm nào trong file DXF.</p>
    {:else if done}
      <p class="text-sm text-green-600 text-center pt-8 font-medium">Đã nhập {placedCount} sản phẩm!</p>
      {#if skippedMsg}
        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 mb-8">{skippedMsg}</p>
      {:else}
        <div class="pb-8"></div>
      {/if}
    {:else}
      <p class="text-xs text-slate-500 mb-3">
        Chọn sản phẩm tương ứng trong catalog cho mỗi loại block. Block không được map sẽ bị bỏ qua.
      </p>
      <div class="space-y-2">
        {#each uniqueBlocks as blk}
          <div class="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <!-- SVG preview -->
            <div class="w-12 h-12 shrink-0 border border-slate-200 rounded bg-slate-50 flex items-center justify-center overflow-hidden">
              {#if blk.preview}
                {@html blk.preview}
              {:else}
                <span class="text-xs text-slate-300">?</span>
              {/if}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-mono text-slate-500 truncate" title={blk.name}>{blk.name}</p>
              <p class="text-xs text-slate-400">{blk.count} vị trí</p>
            </div>
            <select
              class="text-sm border border-slate-300 rounded-md px-2 py-1 bg-white w-44 shrink-0"
              bind:value={mapping[blk.name]}
            >
              <option value="">— bỏ qua —</option>
              {#each furnitureCatalog as cat}
                <option value={cat.id}>{cat.name}</option>
              {/each}
            </select>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Footer -->
  {#if !loading && !error && inserts.length > 0 && !done}
    <div class="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
      <p class="text-xs text-slate-500">
        {importCount > 0 ? `Sẽ đặt ${importCount} sản phẩm` : 'Chưa chọn sản phẩm nào'}
      </p>
      <div class="flex gap-2">
        <button
          class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
          onclick={onClose}
        >Hủy</button>
        <button
          class="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={importCount === 0 || importing}
          onclick={doImport}
        >
          {importing ? 'Đang nhập…' : `Nhập ${importCount} sản phẩm`}
        </button>
      </div>
    </div>
  {/if}
</div>
