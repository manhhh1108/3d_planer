<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { api, type ApiProduct } from '$lib/services/api';
  import { canEdit } from '$lib/stores/auth';

  const projectId = $page.params.projectId ?? '';

  const STAGES = ['Hàn', 'Sơn', 'Lắp ráp', 'Cắt', 'Khác'];
  const STAGE_COLORS: Record<string, string> = {
    'Hàn': 'bg-amber-50 text-amber-700',
    'Sơn': 'bg-green-50 text-green-700',
    'Lắp ráp': 'bg-blue-50 text-blue-700',
    'Cắt': 'bg-red-50 text-red-600',
  };

  let products = $state<ApiProduct[]>([]);
  let projectName = $state('');
  let loading = $state(true);
  let search = $state('');

  // Form modal (create/edit)
  let showForm = $state(false);
  let editingId = $state<string | null>(null);
  let fName = $state('');
  let fCode = $state('');
  let fWeight = $state<number | null>(null);
  let fArea = $state<number | null>(null);
  let fStage = $state('Hàn');
  let fCategory = $state('san_pham');
  let fColor = $state('#3b82f6');
  let fWidthM = $state<number | null>(null);
  let fDepthM = $state<number | null>(null);
  let fHeightM = $state<number | null>(null);
  let confirmDeleteId = $state<string | null>(null);

  let uploadingFor = $state<string | null>(null);
  let uploadError = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  let filtered = $derived(
    products.filter((p) => {
      const s = search.toLowerCase();
      return !s || p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s);
    })
  );

  async function refresh() {
    loading = true;
    try {
      const [list, proj] = await Promise.all([api.products.list(projectId), api.projects.get(projectId)]);
      products = list;
      projectName = proj.name;
    } finally {
      loading = false;
    }
  }

  onMount(async () => { await refresh(); ensurePolling(); });

  async function uploadCad(product: ApiProduct, file: File) {
    uploadError = null;
    uploadingFor = product.id;
    try {
      if (product.assetId) {
        try { await api.assets.remove(product.assetId); } catch { /* asset có thể đã mất */ }
      }
      await api.assets.upload(file, product.id);
      await refresh();
      ensurePolling();
    } catch (e) {
      uploadError = `Upload thất bại: ${e instanceof Error ? e.message : e}`;
    } finally {
      uploadingFor = null;
    }
  }

  function onCadFileChange(product: ApiProduct, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) uploadCad(product, file);
    input.value = '';
  }

  function ensurePolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      const busy = products.some(
        (p) => p.asset && (p.asset.status === 'pending' || p.asset.status === 'processing')
      );
      if (!busy) {
        clearInterval(pollTimer!);
        pollTimer = null;
        return;
      }
      await refresh();
    }, 2500);
  }

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  function openCreate() {
    editingId = null;
    fName = ''; fCode = ''; fWeight = null; fArea = null;
    fStage = 'Hàn'; fCategory = 'san_pham'; fColor = '#3b82f6';
    fWidthM = null; fDepthM = null; fHeightM = null;
    showForm = true;
  }

  function openEdit(p: ApiProduct) {
    editingId = p.id;
    fName = p.name; fCode = p.code;
    fWeight = p.weightKg; fArea = p.areaM2;
    fStage = p.processStage ?? 'Khác'; fCategory = p.category; fColor = p.color;
    fWidthM = p.metadata?.widthM ?? null;
    fDepthM = p.metadata?.depthM ?? null;
    fHeightM = p.metadata?.heightM ?? null;
    showForm = true;
  }

  async function submit() {
    if (!fName.trim() || !fCode.trim()) return;
    const metadata: Record<string, number> = {};
    if (fWidthM) metadata.widthM = fWidthM;
    if (fDepthM) metadata.depthM = fDepthM;
    if (fHeightM) metadata.heightM = fHeightM;
    const data = {
      name: fName.trim(),
      code: fCode.trim(),
      weightKg: fWeight,
      areaM2: fArea,
      processStage: fStage,
      category: fCategory,
      color: fColor,
      metadata: Object.keys(metadata).length ? metadata : null,
    };
    if (editingId) {
      await api.products.update(editingId, data);
    } else {
      await api.products.create({ projectId, ...data });
    }
    showForm = false;
    await refresh();
  }

  async function deleteProduct(id: string) {
    await api.products.remove(id);
    confirmDeleteId = null;
    await refresh();
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <div class="bg-gradient-to-r from-slate-800 to-slate-700 shadow-sm">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
      <a href={base || '/'} class="flex items-center gap-1 text-white/70 hover:text-white text-sm transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        Trang chủ
      </a>
      <div class="h-5 w-px bg-white/20"></div>
      <h1 class="text-xl font-bold text-white flex-1 truncate">📦 {projectName || 'Sản phẩm & Thiết bị'}</h1>
      <input
        type="text"
        bind:value={search}
        placeholder="🔍 Tìm theo tên hoặc mã..."
        class="px-3 py-2 rounded-lg text-sm bg-white/10 border border-white/20 text-white placeholder-white/40 outline-none focus:bg-white/20 w-56"
      />
      <a href={`${base}/reports/${projectId}`} class="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 text-sm font-medium border border-white/20 transition-colors">
        📊 Báo cáo
      </a>
      {#if $canEdit}
      <button onclick={openCreate} class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold text-sm">
        + Thêm sản phẩm
      </button>
      {/if}
    </div>
  </div>

  <div class="max-w-6xl mx-auto px-6 py-8">
    {#if uploadError}
      <div class="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{uploadError}</div>
    {/if}
    {#if loading}
      <div class="text-center py-16 text-gray-400">Đang tải...</div>
    {:else if filtered.length === 0}
      <div class="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
        <div class="text-4xl mb-3">📦</div>
        <p class="text-gray-400 font-medium">{search ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm nào'}</p>
      </div>
    {:else}
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th class="px-4 py-3"></th>
              <th class="px-4 py-3">Tên sản phẩm</th>
              <th class="px-4 py-3">Mã</th>
              <th class="px-4 py-3">Khối lượng</th>
              <th class="px-4 py-3">Diện tích</th>
              <th class="px-4 py-3">Kích thước (m)</th>
              <th class="px-4 py-3">CAD</th>
              <th class="px-4 py-3">Công đoạn</th>
              <th class="px-4 py-3">Loại</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as p}
              <tr class="border-b border-gray-100 last:border-0 hover:bg-blue-50/50 transition-colors">
                <td class="px-4 py-3">
                  <div class="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold" style="background-color: {p.color}20; color: {p.color}">
                    {p.code.slice(-2)}
                  </div>
                </td>
                <td class="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                <td class="px-4 py-3 text-gray-500">{p.code}</td>
                <td class="px-4 py-3 text-gray-500">{p.weightKg ? (p.weightKg / 1000).toFixed(1) + ' T' : '—'}</td>
                <td class="px-4 py-3 text-gray-500">{p.areaM2 ? p.areaM2 + ' m²' : '—'}</td>
                <td class="px-4 py-3 text-gray-500">
                  {p.metadata?.widthM ? `${p.metadata.widthM} × ${p.metadata.depthM ?? '?'} × ${p.metadata.heightM ?? '?'}` : '—'}
                </td>
                <td class="px-3 py-2">
                  {#if p.asset?.status === 'ready'}
                    <span class="text-[11px] px-2 py-0.5 rounded-md bg-green-50 text-green-600 font-medium">{p.asset.fileType.toUpperCase()}</span>
                  {:else if p.asset?.status === 'failed'}
                    <span class="text-[11px] px-2 py-0.5 rounded-md bg-red-50 text-red-600 font-medium" title={p.asset.error ?? ''}>Lỗi</span>
                  {:else if p.asset}
                    <span class="text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 font-medium">Đang xử lý</span>
                  {:else}
                    <span class="text-[11px] text-gray-300">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  {#if p.processStage}
                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-medium {STAGE_COLORS[p.processStage] ?? 'bg-gray-100 text-gray-600'}">{p.processStage}</span>
                  {:else}—{/if}
                </td>
                <td class="px-4 py-3 text-gray-500 text-xs">{p.category === 'thiet_bi' ? '⚙️ Thiết bị' : '📦 Sản phẩm'}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-1 justify-end">
                    {#if $canEdit}
                    <label class="px-2.5 py-1 text-xs text-gray-500 bg-gray-50 rounded-lg hover:bg-blue-50 hover:text-blue-500 font-medium cursor-pointer" title="Upload CAD (dwg, dxf, step, stp, ifc)">
                      <input type="file" accept=".dwg,.dxf,.step,.stp,.ifc" class="hidden"
                        onchange={(e) => onCadFileChange(p, e)} disabled={uploadingFor === p.id} />
                      {uploadingFor === p.id ? '...' : 'CAD'}
                    </label>
                    <button onclick={() => openEdit(p)} class="px-2.5 py-1 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 font-medium">Sửa</button>
                    {#if confirmDeleteId === p.id}
                      <button onclick={() => deleteProduct(p.id)} class="px-2.5 py-1 text-xs text-white bg-red-500 rounded-lg hover:bg-red-600 font-medium">Xóa?</button>
                      <button onclick={() => confirmDeleteId = null} class="px-2 py-1 text-xs text-gray-500 bg-gray-100 rounded-lg">✕</button>
                    {:else}
                      <button onclick={() => confirmDeleteId = p.id} class="px-2.5 py-1 text-xs text-red-500 bg-red-50 rounded-lg hover:bg-red-100 font-medium">Xóa</button>
                    {/if}
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <!-- Form modal -->
  {#if showForm}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={() => showForm = false} onkeydown={(e) => { if (e.key === 'Escape') showForm = false; }} role="dialog" tabindex="-1">
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <h2 class="text-lg font-bold text-gray-800 mb-4">{editingId ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
        <div class="grid grid-cols-2 gap-3">
          <label class="block col-span-2">
            <span class="text-xs font-medium text-gray-500">Tên sản phẩm *</span>
            <input type="text" bind:value={fName} class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Mã *</span>
            <input type="text" bind:value={fCode} placeholder="SP-001" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Loại</span>
            <select bind:value={fCategory} class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white">
              <option value="san_pham">📦 Sản phẩm</option>
              <option value="thiet_bi">⚙️ Thiết bị</option>
            </select>
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Khối lượng (kg)</span>
            <input type="number" bind:value={fWeight} class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Diện tích (m²)</span>
            <input type="number" bind:value={fArea} class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Công đoạn</span>
            <select bind:value={fStage} class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white">
              {#each STAGES as s}<option value={s}>{s}</option>{/each}
            </select>
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Màu block</span>
            <input type="color" bind:value={fColor} class="mt-1 w-full h-9 border border-gray-200 rounded-lg cursor-pointer" />
          </label>
          <div class="col-span-2">
            <span class="text-xs font-medium text-gray-500">Kích thước block trên mặt bằng (m) — bỏ trống sẽ tính từ diện tích</span>
            <div class="grid grid-cols-3 gap-2 mt-1">
              <input type="number" bind:value={fWidthM} placeholder="Rộng" step="0.1" class="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
              <input type="number" bind:value={fDepthM} placeholder="Sâu" step="0.1" class="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
              <input type="number" bind:value={fHeightM} placeholder="Cao" step="0.1" class="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
            </div>
          </div>
        </div>
        <div class="flex gap-2 justify-end mt-5">
          <button onclick={() => showForm = false} class="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
          <button onclick={submit} disabled={!fName.trim() || !fCode.trim()} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
            {editingId ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
