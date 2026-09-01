<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { api, FILES_BASE, type ApiLayout, type ApiSite } from '$lib/services/api';
  import { isAdmin } from '$lib/stores/auth';

  const siteId = $page.params.id ?? '';

  let site = $state<ApiSite | null>(null);
  let loading = $state(true);

  let showLayoutForm = $state(false);
  let editingLayoutId = $state<string | null>(null);
  let editingLayoutSnapshots = $state(0);
  let editingLayoutW = $state(0);
  let editingLayoutH = $state(0);
  let newLayoutName = $state('');
  let newLayoutW = $state(100);
  let newLayoutH = $state(60);
  let layoutSaving = $state(false);
  let layoutError = $state<string | null>(null);
  let confirmDeleteId = $state<string | null>(null);

  let showSiteForm = $state(false);
  let siteName = $state('');
  let siteAddress = $state('');
  let siteActive = $state(true);
  let siteCompany = $state('');
  let siteSaving = $state(false);
  let siteError = $state<string | null>(null);
  let logoBusy = $state(false);

  // Thu nhỏ layout đã có snapshot thì block đã đặt có thể rơi ra ngoài biên mới
  let shrinkWarning = $derived(
    editingLayoutId !== null &&
      editingLayoutSnapshots > 0 &&
      (newLayoutW < editingLayoutW || newLayoutH < editingLayoutH)
  );
  let uploadingBgFor = $state<string | null>(null);
  let bgError = $state<string | null>(null);

  /** Nền dựng từ DXF lưu thành .svg, nền ảnh giữ đuôi gốc — nhãn phải nói đúng loại */
  function bgKind(file: string | null): string {
    if (!file) return '';
    return file.toLowerCase().endsWith('.svg') ? 'Đã có nền DXF' : 'Đã có nền ảnh';
  }

  async function uploadBackground(layoutId: string, file: File) {
    bgError = null;
    uploadingBgFor = layoutId;
    try {
      await api.layouts.uploadBackground(layoutId, file);
      await refresh();
    } catch (e) {
      bgError = e instanceof Error ? e.message : 'Upload nền thất bại';
    } finally {
      uploadingBgFor = null;
    }
  }

  async function deleteBackground(layoutId: string) {
    bgError = null;
    try {
      await api.layouts.deleteBackground(layoutId);
      await refresh();
    } catch (e) {
      bgError = e instanceof Error ? e.message : 'Xóa nền thất bại';
    }
  }

  function onBgFileChange(layoutId: string, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) uploadBackground(layoutId, file);
    input.value = '';
  }

  async function refresh() {
    loading = true;
    try {
      site = await api.sites.get(siteId);
    } finally {
      loading = false;
    }
  }

  onMount(refresh);

  function openCreateLayout() {
    editingLayoutId = null;
    editingLayoutSnapshots = 0;
    editingLayoutW = 0;
    editingLayoutH = 0;
    newLayoutName = '';
    newLayoutW = 100;
    newLayoutH = 60;
    layoutError = null;
    showLayoutForm = true;
  }

  function openEditLayout(layout: ApiLayout & { _count?: { snapshots: number } }) {
    editingLayoutId = layout.id;
    editingLayoutSnapshots = layout._count?.snapshots ?? 0;
    editingLayoutW = layout.widthM;
    editingLayoutH = layout.heightM;
    newLayoutName = layout.name;
    newLayoutW = layout.widthM;
    newLayoutH = layout.heightM;
    layoutError = null;
    showLayoutForm = true;
  }

  function closeLayoutForm() {
    if (layoutSaving) return;
    showLayoutForm = false;
  }

  async function submitLayout() {
    if (!newLayoutName.trim() || newLayoutW <= 0 || newLayoutH <= 0 || layoutSaving) return;
    layoutError = null;
    layoutSaving = true;
    const data = { name: newLayoutName.trim(), widthM: newLayoutW, heightM: newLayoutH };
    try {
      if (editingLayoutId) {
        await api.layouts.update(editingLayoutId, data);
      } else {
        const layout = await api.layouts.create({ siteId, ...data });
        showLayoutForm = false;
        goto(`${base}/editor?layoutId=${layout.id}`);
        return;
      }
    } catch (e) {
      layoutError = e instanceof Error ? e.message : String(e);
      return;
    } finally {
      layoutSaving = false;
    }
    showLayoutForm = false;
    await refresh();
  }

  function openEditSite() {
    if (!site) return;
    siteName = site.name;
    siteAddress = site.address ?? '';
    siteActive = site.active;
    siteCompany = site.companyName ?? '';
    siteError = null;
    showSiteForm = true;
  }

  function closeSiteForm() {
    if (siteSaving) return;
    showSiteForm = false;
  }

  async function submitSite() {
    if (!siteName.trim() || siteSaving) return;
    siteError = null;
    siteSaving = true;
    try {
      await api.sites.update(siteId, {
        name: siteName.trim(),
        address: siteAddress.trim(),
        active: siteActive,
        companyName: siteCompany.trim(),
      });
    } catch (e) {
      siteError = e instanceof Error ? e.message : String(e);
      return;
    } finally {
      siteSaving = false;
    }
    showSiteForm = false;
    await refresh();
  }

  /** Logo ghi ngay khi chọn file — không đợi bấm Lưu, vì nó là file chứ không phải ô nhập */
  async function pickLogo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      siteError = null;
      logoBusy = true;
      try {
        await api.sites.uploadLogo(siteId, file);
        await refresh();
      } catch (e) {
        siteError = e instanceof Error ? e.message : String(e);
      } finally {
        logoBusy = false;
      }
    };
    input.click();
  }

  async function removeLogo() {
    siteError = null;
    logoBusy = true;
    try {
      await api.sites.removeLogo(siteId);
      await refresh();
    } catch (e) {
      siteError = e instanceof Error ? e.message : String(e);
    } finally {
      logoBusy = false;
    }
  }

  async function deleteLayout(id: string) {
    await api.layouts.remove(id);
    confirmDeleteId = null;
    await refresh();
  }
</script>

<svelte:head><title>{site?.name ? `${site.name} — Floor Manager` : 'Mặt bằng — Floor Manager'}</title></svelte:head>

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
        <div class="flex items-center gap-2">
          <h1 class="text-xl font-bold text-white truncate">🏭 {site?.name ?? '...'}</h1>
          {#if site && !site.active}
            <span class="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-white/60 font-medium shrink-0">Ngừng hoạt động</span>
          {/if}
          {#if $isAdmin && site}
            <button
              onclick={openEditSite}
              class="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              title="Sửa thông tin mặt bằng" aria-label="Sửa thông tin mặt bằng"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          {/if}
        </div>
        {#if site?.address}
          <p class="text-xs text-white/50 truncate">{site.address}</p>
        {/if}
      </div>
    </div>
  </div>

  <div class="max-w-5xl mx-auto px-6 py-8">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-base font-bold text-gray-800">Layout ({site?.layouts?.length ?? 0})</h2>
      {#if $isAdmin}
      <button onclick={openCreateLayout} class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">
        + Thêm layout
      </button>
      {/if}
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
          {@const preview = layout.snapshots?.[0]?.thumbnail}
          <div class="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-200 transition-all relative">
            <a href={`${base}/editor?layoutId=${layout.id}`} class="block">
              <div class="aspect-[5/3] -mx-1 mb-3 rounded-lg bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
                {#if preview}
                  <img
                    src={`${FILES_BASE}${preview}`}
                    alt={`Mặt bằng ${layout.name}`}
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                {:else}
                  <div class="text-center text-gray-300">
                    <div class="text-2xl">🗺</div>
                    <div class="text-[11px] mt-0.5">Chưa có ảnh — mở editor và lưu</div>
                  </div>
                {/if}
              </div>
              <div class="min-w-0">
                <h3 class="font-semibold text-gray-800 truncate">{layout.name}</h3>
                <p class="text-xs text-gray-400">{layout.widthM} × {layout.heightM} m · {layout._count?.snapshots ?? 0} snapshot</p>
              </div>
              <div class="mt-2 text-xs text-blue-600 font-medium">Mở editor →</div>
            </a>
            {#if $isAdmin}
            <div class="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2" onclick={(e) => e.stopPropagation()}>
              {#if layout.backgroundFile}
                <span class="text-[11px] text-green-600 font-medium flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {bgKind(layout.backgroundFile)}
                </span>
                <label class="text-[11px] text-gray-400 hover:text-blue-500 cursor-pointer transition-colors">
                  <input type="file" accept=".dxf,.dwg,.png,.jpg,.jpeg,.webp" class="hidden" disabled={uploadingBgFor === layout.id} onchange={(e) => onBgFileChange(layout.id, e)} />
                  {uploadingBgFor === layout.id ? 'Đang xử lý…' : 'Thay nền'}
                </label>
                <button
                  onclick={() => deleteBackground(layout.id)}
                  class="text-[11px] text-red-400 hover:text-red-600 transition-colors"
                >Xóa nền</button>
              {:else}
                <label class="w-full text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-2 cursor-pointer flex items-center justify-center gap-1.5 transition-colors">
                  <input
                    type="file"
                    accept=".dxf,.dwg,.png,.jpg,.jpeg,.webp"
                    class="hidden"
                    disabled={uploadingBgFor === layout.id}
                    onchange={(e) => onBgFileChange(layout.id, e)}
                  />
                  {#if uploadingBgFor === layout.id}
                    <span>Đang xử lý…</span>
                  {:else}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span>Import nền DXF/DWG hoặc ảnh</span>
                  {/if}
                </label>
              {/if}
            </div>
            {#if confirmDeleteId === layout.id}
              <div class="absolute top-3 right-3 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1.5 flex items-center gap-2 z-10">
                <span class="text-xs text-gray-500">Xóa?</span>
                <button onclick={() => deleteLayout(layout.id)} class="px-2 py-0.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">Có</button>
                <button onclick={() => confirmDeleteId = null} class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300">Không</button>
              </div>
            {:else}
              <div class="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onclick={() => openEditLayout(layout)}
                  class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                  title="Sửa layout" aria-label="Sửa layout"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button
                  onclick={() => confirmDeleteId = layout.id}
                  class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Xóa layout" aria-label="Xóa layout"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            {/if}
            {/if}
          </div>
        {/each}
        {#if bgError}
          <div class="col-span-full mt-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{bgError}</div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Layout modal (thêm / sửa) -->
  {#if showLayoutForm}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={closeLayoutForm} onkeydown={(e) => { if (e.key === 'Escape') closeLayoutForm(); }} role="dialog" tabindex="-1">
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <h2 class="text-lg font-bold text-gray-800 mb-4">{editingLayoutId ? 'Sửa layout' : 'Thêm layout'}</h2>
        {#if layoutError}
          <div class="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">{layoutError}</div>
        {/if}
        <label class="block mb-3">
          <span class="text-xs font-medium text-gray-500">Tên layout *</span>
          <input type="text" bind:value={newLayoutName} placeholder="VD: Bãi A, Khu xưởng 1..."
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            onkeydown={(e) => { if (e.key === 'Enter') submitLayout(); }} />
        </label>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Chiều rộng (m)</span>
            <input type="number" bind:value={newLayoutW} min="1" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Chiều dài (m)</span>
            <input type="number" bind:value={newLayoutH} min="1" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </label>
        </div>
        {#if shrinkWarning}
          <div class="mb-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2 text-xs">
            Layout này đã có {editingLayoutSnapshots} snapshot. Thu nhỏ từ {editingLayoutW} × {editingLayoutH} m
            có thể khiến block đã đặt nằm ngoài biên mới — cần mở editor kiểm tra lại.
          </div>
        {/if}
        <div class="flex gap-2 justify-end mt-5">
          <button onclick={closeLayoutForm} disabled={layoutSaving} class="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">Hủy</button>
          <button onclick={submitLayout} disabled={!newLayoutName.trim() || layoutSaving} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
            {layoutSaving ? 'Đang lưu…' : editingLayoutId ? 'Lưu thay đổi' : 'Tạo & mở editor'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Site modal (sửa thông tin mặt bằng) -->
  {#if showSiteForm}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={closeSiteForm} onkeydown={(e) => { if (e.key === 'Escape') closeSiteForm(); }} role="dialog" tabindex="-1">
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <h2 class="text-lg font-bold text-gray-800 mb-4">Sửa mặt bằng</h2>
        {#if siteError}
          <div class="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">{siteError}</div>
        {/if}
        <label class="block mb-3">
          <span class="text-xs font-medium text-gray-500">Tên mặt bằng *</span>
          <input type="text" bind:value={siteName} placeholder="VD: Nhà máy chính"
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            onkeydown={(e) => { if (e.key === 'Enter') submitSite(); }} />
        </label>
        <label class="block mb-3">
          <span class="text-xs font-medium text-gray-500">Địa chỉ</span>
          <input type="text" bind:value={siteAddress} placeholder="VD: KCN Đình Vũ, Hải Phòng"
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            onkeydown={(e) => { if (e.key === 'Enter') submitSite(); }} />
        </label>
        <div class="border-t border-gray-100 pt-3 mb-3">
          <p class="text-xs font-semibold text-gray-500 mb-2">Khung tên bản vẽ</p>
          <p class="text-[11px] text-gray-400 mb-2">Dùng cho mọi bản PDF xuất từ các layout của mặt bằng này.</p>
          <label class="block mb-3">
            <span class="text-xs font-medium text-gray-500">Tên công ty</span>
            <input type="text" bind:value={siteCompany} placeholder="VD: Công ty CP VHE"
              class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
              onkeydown={(e) => { if (e.key === 'Enter') submitSite(); }} />
          </label>
          <div class="flex items-center gap-3">
            <div class="w-20 h-12 shrink-0 border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden">
              {#if site?.companyLogo}
                <img src={`${FILES_BASE}${site.companyLogo}`} alt="Logo công ty" class="max-w-full max-h-full object-contain" />
              {:else}
                <span class="text-[10px] text-gray-300">chưa có</span>
              {/if}
            </div>
            <div class="flex gap-2">
              <button onclick={pickLogo} disabled={logoBusy}
                class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                {logoBusy ? 'Đang xử lý…' : site?.companyLogo ? 'Đổi logo' : 'Tải logo lên'}
              </button>
              {#if site?.companyLogo}
                <button onclick={removeLogo} disabled={logoBusy}
                  class="px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">Gỡ</button>
              {/if}
            </div>
          </div>
          <p class="text-[11px] text-gray-400 mt-2">PNG, JPEG hoặc WEBP, tối đa 1MB. Lưu ngay khi chọn file.</p>
        </div>

        <label class="flex items-center gap-2 mb-1 cursor-pointer">
          <input type="checkbox" bind:checked={siteActive} class="w-4 h-4 rounded border-gray-300 accent-blue-600" />
          <span class="text-sm text-gray-700">Đang hoạt động</span>
        </label>
        <p class="text-[11px] text-gray-400 ml-6">Bỏ chọn để đánh dấu mặt bằng đã ngừng sử dụng.</p>
        <div class="flex gap-2 justify-end mt-5">
          <button onclick={closeSiteForm} disabled={siteSaving} class="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">Hủy</button>
          <button onclick={submitSite} disabled={!siteName.trim() || siteSaving} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
            {siteSaving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
