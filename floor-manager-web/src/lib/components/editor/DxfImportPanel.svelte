<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/services/api';
  import type { DxfInsertData } from '$lib/services/api';
  import { furnitureCatalog } from '$lib/utils/furnitureCatalog';
  import { addFurniture, activeFloor, layoutDimsCm, assignZoneToItem } from '$lib/stores/project';

  let { layoutId, onClose }: { layoutId: string; onClose: () => void } = $props();

  let inserts = $state<DxfInsertData[]>([]);
  let loading = $state(true);
  let error = $state('');
  let importing = $state(false);
  let done = $state(false);

  // blockName → catalogId mapping chosen by user
  let mapping = $state<Record<string, string>>({});
  /** Số block được điền sẵn từ lần nhập trước */
  let prefilled = $state(0);
  /** Bỏ qua những vị trí đã có sẵn block đúng loại trên mặt bằng */
  let skipExisting = $state(true);

  /**
   * Khoá nhận dạng một block đã đặt: sản phẩm + toạ độ làm tròn tới mm.
   *
   * Không có trường nào ghi "block này đến từ DXF", và thêm vào thì phải migrate
   * bảng positions. Không cần: backend đã dùng đúng cách này trong
   * snapshots.ts (positionKey) — hai block khác nhau không thể vừa cùng sản
   * phẩm vừa cùng toạ độ, nên hình học là khoá đủ tin cậy.
   */
  function placedKey(catalogId: string, xCm: number, yCm: number): string {
    return `${catalogId}|${Math.round(xCm * 10)}|${Math.round(yCm * 10)}`;
  }

  let placedKeys = $derived.by(() => {
    const keys = new Set<string>();
    for (const f of $activeFloor?.furniture ?? []) {
      keys.add(placedKey(f.catalogId, f.position.x, f.position.y));
    }
    return keys;
  });

  /** Vị trí này đã có sẵn block đúng loại chưa? */
  function alreadyPlaced(ins: DxfInsertData): boolean {
    const catalogId = mapping[ins.blockName];
    return !!catalogId && placedKeys.has(placedKey(catalogId, ins.xCm, ins.yCm));
  }

  /**
   * Block phủ gần hết bản vẽ thì là khung tên / bản vẽ nền, không phải sản phẩm.
   * Đánh dấu để người dùng khỏi mất công dò từng cái.
   */
  function looksLikeDrawingFrame(widthCm: number, heightCm: number): boolean {
    const { widthCm: lw, heightCm: lh } = $layoutDimsCm;
    if (!lw || !lh) return false;
    return widthCm > lw * 0.5 && heightCm > lh * 0.5;
  }

  // Gộp theo tên block, kèm layer/kích thước/số vị trí — sắp xếp nhiều nhất lên
  // trước vì sản phẩm thì lặp lại, còn khung bản vẽ chỉ có một.
  let uniqueBlocks = $derived.by(() => {
    const map = new Map<string, { count: number; preview: string; layer: string; widthCm: number; heightCm: number; existing: number }>();
    for (const ins of inserts) {
      const cur = map.get(ins.blockName);
      if (cur) {
        cur.count++;
        if (alreadyPlaced(ins)) cur.existing++;
      } else {
        map.set(ins.blockName, {
          count: 1,
          preview: ins.svgPreview,
          layer: ins.layer,
          widthCm: ins.widthCm,
          heightCm: ins.heightCm,
          existing: alreadyPlaced(ins) ? 1 : 0,
        });
      }
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);
  });

  let skippedMsg = $state<string | null>(null);
  let placedCount = $state(0);

  let importCount = $derived(
    inserts.filter((ins) => !!mapping[ins.blockName] && !(skipExisting && alreadyPlaced(ins))).length
  );
  let duplicateCount = $derived(
    inserts.filter((ins) => !!mapping[ins.blockName] && alreadyPlaced(ins)).length
  );

  onMount(async () => {
    try {
      const [ins, layout] = await Promise.all([
        api.layouts.fetchInserts(layoutId),
        api.layouts.get(layoutId),
      ]);
      inserts = ins;
      // Chỉ nhận lại mapping trỏ tới sản phẩm còn trong catalog — sản phẩm bị
      // xoá mà vẫn điền sẵn thì dropdown hiện rỗng, người dùng tưởng đã map.
      const valid = new Set(furnitureCatalog.map((c) => c.id));
      const blocks = new Set(ins.map((i) => i.blockName));
      const saved = Object.entries(layout.dxfBlockMap ?? {}).filter(
        ([name, id]) => valid.has(id) && blocks.has(name)
      );
      mapping = Object.fromEntries(saved);
      prefilled = saved.length;
    } catch (e: any) {
      error = e?.message ?? String(e);
    } finally {
      loading = false;
    }
  });

  async function doImport() {
    importing = true;
    // File DXF có thể chứa nhiều bản hơn số lượng sản phẩm cho phép. Đặt tới
    // hạn mức rồi dừng, và nói rõ đã bỏ qua bao nhiêu thay vì âm thầm nuốt.
    let placed = 0;
    let duplicates = 0;
    const skipped = new Map<string, number>();
    const newIds: string[] = [];

    for (const ins of inserts) {
      const catalogId = mapping[ins.blockName];
      if (!catalogId) continue;
      if (skipExisting && alreadyPlaced(ins)) {
        duplicates++;
        continue;
      }
      const newId = addFurniture(catalogId, { x: ins.xCm, y: ins.yCm }, ins.rotationDeg);
      if (newId) {
        placed++;
        newIds.push(newId);
      } else {
        skipped.set(ins.blockName, (skipped.get(ins.blockName) ?? 0) + 1);
      }
    }

    // Nhập DXF là đường không thủ công (Q7): auto-gán vùng/công đoạn cho từng
    // block vừa thêm giống nhân bản/dán — enforce=false nên chỉ cảnh báo, không
    // bật popup: tự gán công đoạn khi lọt trọn một vùng đơn công đoạn, đánh dấu
    // out-of-zone nếu ngoài vùng, để trống nếu vùng đa công đoạn.
    for (const id of newIds) assignZoneToItem(id, false);

    // Nhớ mapping cho lần sau. Hỏng thì thôi — không được làm hỏng lần nhập vừa xong.
    try {
      await api.layouts.saveDxfMap(layoutId, mapping);
    } catch (e) {
      console.error('[DXF] Không lưu được mapping:', e);
    }

    importing = false;
    placedCount = placed;
    done = true;

    const notes: string[] = [];
    if (duplicates > 0) notes.push(`bỏ qua ${duplicates} vị trí đã có sẵn`);
    if (skipped.size > 0) {
      const total = [...skipped.values()].reduce((a, b) => a + b, 0);
      const detail = [...skipped.entries()].map(([name, n]) => `${name} (${n})`).join(', ');
      notes.push(`bỏ qua ${total} vì vượt số lượng cho phép: ${detail}`);
    }
    if (notes.length > 0) {
      skippedMsg = `Đã nhập ${placed} block, ${notes.join('; ')}.`;
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
<div class="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
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
      <p class="text-xs text-slate-500 mb-1">
        Chọn sản phẩm tương ứng cho mỗi loại block. Block không được map sẽ bị bỏ qua.
      </p>
      {#if prefilled > 0}
        <p class="text-xs text-blue-600 mb-3">↺ Đã điền sẵn {prefilled} block theo lần nhập trước.</p>
      {:else}
        <div class="mb-3"></div>
      {/if}

      <div class="space-y-2">
        {#each uniqueBlocks as blk}
          {@const isFrame = looksLikeDrawingFrame(blk.widthCm, blk.heightCm)}
          <div class="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 {isFrame && !mapping[blk.name] ? 'opacity-60' : ''}">
            <!-- SVG preview -->
            <div class="w-12 h-12 shrink-0 border border-slate-200 rounded bg-slate-50 flex items-center justify-center overflow-hidden">
              {#if blk.preview}
                {@html blk.preview}
              {:else}
                <span class="text-xs text-slate-300">?</span>
              {/if}
            </div>
            <div class="flex-1 min-w-0">
              <!-- Layer + kích thước đứng trước: tên block trong bản vẽ thật là
                   mã sinh tự động, đọc không ra gì. -->
              <p class="text-sm text-slate-700 truncate">
                <span class="font-medium">{blk.layer || 'không có layer'}</span>
                <span class="text-slate-400"> · {blk.widthCm} × {blk.heightCm} cm</span>
              </p>
              <p class="text-xs font-mono text-slate-400 truncate" title={blk.name}>{blk.name}</p>
              <p class="text-xs text-slate-400">
                {blk.count} vị trí{#if blk.existing > 0}<span class="text-amber-600"> · {blk.existing} đã có trên mặt bằng</span>{/if}
                {#if isFrame}<span class="text-slate-400"> · có vẻ là khung bản vẽ</span>{/if}
              </p>
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
    <div class="px-5 py-4 border-t border-slate-200 space-y-3">
      {#if duplicateCount > 0}
        <label class="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" bind:checked={skipExisting} class="rounded border-slate-300" />
          Bỏ qua {duplicateCount} vị trí đã có sẵn block đúng loại
          {#if !skipExisting}<span class="text-amber-600">— sẽ đặt chồng lên</span>{/if}
        </label>
      {/if}
      <div class="flex items-center justify-between gap-3">
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
    </div>
  {/if}
</div>
