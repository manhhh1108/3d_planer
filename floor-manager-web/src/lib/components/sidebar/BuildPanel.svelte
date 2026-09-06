<script lang="ts">
  import { selectedTool, placingFurnitureId, setBackgroundImage, draggingCatalogId, currentProject, externalPlacements } from '$lib/stores/project';
  import { autoArrangeZones, revalidateZones, selectedZoneId } from '$lib/stores/project';
  import { backgroundPanelOpen, dxfImportOpen } from '$lib/stores/ui';
  import { layoutBgFile } from '$lib/stores/project';
  import type { Tool } from '$lib/stores/project';
  import type { FurnitureDef } from '$lib/utils/furnitureCatalog';
  import { getModelFile, getThumbnail } from '$lib/utils/furnitureThumbnails';
  import { productCatalog } from '$lib/stores/productCatalog';
  import { polygonArea } from '$lib/utils/zoneGeometry';
  import { api, FILES_BASE } from '$lib/services/api';
  import { canEdit } from '$lib/stores/auth';

  /** Rỗng nghĩa là editor đang chạy chế độ local (demo/offline) */
  let { layoutId = '' }: { layoutId?: string } = $props();

  let bgUploading = $state(false);
  let bgError = $state<string | null>(null);
  let confirmRemoveBg = $state(false);

  // Backend chỉ cho ADMIN đổi nền layout. Khoá luôn ở giao diện, chứ để bấm
  // được rồi nhận 403 thì người dùng tưởng chức năng hỏng.
  let canEditBg = $derived(!layoutId || $canEdit);

  /**
   * Nền hiện tại có phải bản vẽ CAD không.
   *
   * Nền dựng từ DXF được lưu thành .svg; nền ảnh thì giữ đuôi gốc. Chỉ bản vẽ
   * CAD mới đọc được danh sách block, nên nút nhập sản phẩm phải theo cờ này —
   * nếu không, nền ảnh sẽ bật nút lên rồi API trả 404.
   */
  let bgIsCad = $derived(!!$layoutBgFile && $layoutBgFile.split('?')[0].toLowerCase().endsWith('.svg'));

  let activeTab = $state<'draw' | 'objects'>('objects');
  let selectedCategory = $state<string>('All');
  let thumbsReady = $state(0); // increment to trigger reactivity

  let catalogItems = $derived($productCatalog);
  let categories = $derived([...new Set($productCatalog.map((f) => f.category))]);

  // Đếm trên toàn project, không riêng tầng đang mở — `quantity` là số lượng
  // sản phẩm thực có, không phải hạn mức của từng tầng. Phải khớp với
  // remainingQuantity() trong stores/project để canvas và sidebar không lệch nhau.
  const placedCounts = $derived(
    ($currentProject?.floors ?? []).flatMap((f) => f.furniture).reduce<Record<string, number>>((acc, fi) => {
      acc[fi.catalogId] = (acc[fi.catalogId] ?? 0) + 1;
      return acc;
    }, {})
  );

  // Bản đang nằm ở mặt bằng khác cũng chiếm hạn mức: một khối thép không ở
  // hai nơi cùng lúc. Đọc qua $externalPlacements để badge tự cập nhật.
  function elsewhereCount(id: string): number {
    return $externalPlacements.get(id)?.count ?? 0;
  }
  function elsewhereWhere(id: string): string | null {
    const ext = $externalPlacements.get(id);
    if (!ext || ext.layouts.length === 0) return null;
    return ext.layouts.map((l) => `${l.layoutName} · ${l.siteName} (${l.count})`).join(', ');
  }

  function setTool(tool: Tool) {
    selectedTool.set(tool);
    placingFurnitureId.set(null);
  }

  let currentTool = $state<Tool>('select');
  selectedTool.subscribe((t) => { currentTool = t; });

  /**
   * Bấm sắp xếp mà không có gì đổi là chuyện thường: chưa vẽ vùng, item nằm
   * ngoài vùng, item bị khoá, hoặc vùng chật quá không nhét được. Trước đây
   * hàm im lặng thoát ra nên người dùng tưởng nút hỏng — nay nói rõ lý do.
   */
  let arrangeMsg = $state<{ text: string; ok: boolean } | null>(null);
  let arrangeMsgTimer: ReturnType<typeof setTimeout> | null = null;

  function showArrangeMsg(text: string, ok: boolean) {
    arrangeMsg = { text, ok };
    if (arrangeMsgTimer) clearTimeout(arrangeMsgTimer);
    arrangeMsgTimer = setTimeout(() => { arrangeMsg = null; }, 6000);
  }

  function runAutoArrange() {
    const scope = $selectedZoneId ? 'vùng đang chọn' : 'mặt bằng này';
    const res = autoArrangeZones($selectedZoneId ? [$selectedZoneId] : undefined);
    revalidateZones();

    switch (res.status) {
      case 'no-zones':
        showArrangeMsg(`Chưa có vùng nào trên ${scope} — vẽ vùng bằng công cụ Vùng ở trên rồi thử lại.`, false);
        break;
      case 'no-items-in-zone':
        showArrangeMsg('Không sản phẩm nào nằm trong vùng — kéo sản phẩm vào vùng rồi thử lại.', false);
        break;
      case 'all-locked':
        showArrangeMsg('Mọi sản phẩm trong vùng đang bị khoá 🔒 — mở khoá rồi thử lại.', false);
        break;
      case 'done':
        if (res.moved === 0) {
          showArrangeMsg(`Không xếp được sản phẩm nào — vùng chật hoặc khoảng cách yêu cầu quá lớn (${res.skipped} sản phẩm giữ nguyên).`, false);
        } else if (res.skipped > 0) {
          showArrangeMsg(`Đã xếp ${res.moved} sản phẩm; ${res.skipped} sản phẩm không lọt nên giữ nguyên chỗ cũ.`, false);
        } else {
          showArrangeMsg(`Đã xếp lại ${res.moved} sản phẩm.`, true);
        }
        break;
    }
  }

  let totalAreaM2 = $derived.by(() => {
    const f = $currentProject?.floors.find((f) => f.id === $currentProject?.activeFloorId);
    return (f?.zones ?? []).reduce((sum, z) => sum + polygonArea(z.points), 0) / 10000;
  });

  let currentPlacing = $state<string | null>(null);
  placingFurnitureId.subscribe((id) => { currentPlacing = id; });

  // Ảnh 404 (file bị xoá ngoài app) thì bỏ qua, đừng hiện icon ảnh vỡ
  let brokenThumbs = $state(new Set<string>());
  function onThumbError(id: string) {
    brokenThumbs = new Set(brokenThumbs).add(id);
  }
  function thumbOf(item: FurnitureDef): string | null {
    if (item.thumbnailUrl && !brokenThumbs.has(item.id)) return item.thumbnailUrl;
    const file = getModelFile(item.id);
    return file ? getThumbnail(file) : null;
  }

  /** Tổng số bản đã dùng: trên mặt bằng này + đang nằm ở mặt bằng khác */
  function usedCount(item: FurnitureDef): number {
    return (placedCounts[item.id] ?? 0) + elsewhereCount(item.id);
  }

  /** Còn đặt thêm được không — dùng cho cả nút bấm lẫn thao tác kéo */
  function isExhausted(item: FurnitureDef): boolean {
    return usedCount(item) >= (item.quantity ?? 1);
  }

  // Chặn ngay từ lúc bắt đầu kéo: để kéo được rồi mới từ chối lúc thả thì
  // người dùng tưởng thao tác hỏng chứ không hiểu là đã hết số lượng.
  function onItemDragStart(e: DragEvent, item: FurnitureDef) {
    if (isExhausted(item)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('application/o3d-type', 'furniture');
    e.dataTransfer?.setData('application/o3d-id', item.id);
    draggingCatalogId.set(item.id);
  }

  function onFurnitureClick(item: FurnitureDef) {
    // Bấm lại đúng sản phẩm đang đặt = huỷ lệnh, khỏi phải nhớ phím Esc.
    if (currentPlacing === item.id) {
      placingFurnitureId.set(null);
      selectedTool.set('select');
      return;
    }
    if (isExhausted(item)) return; // hết số lượng cho phép
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

  /**
   * Ở chế độ server, ảnh nền thuộc về layout chứ không thuộc về tầng.
   *
   * Trước đây ảnh chỉ được nhét vào floor.backgroundImage, mà backendStore.save()
   * chỉ gửi vị trí block và tường — nên tải xong là mất khi tải lại trang, và
   * 3D cũng không vẽ vì nó chỉ đọc nền cấp layout. Đẩy lên server thì cả 2D,
   * 3D lẫn PDF đều lấy chung một nguồn.
   */
  async function uploadLayoutBackground(file: File) {
    bgUploading = true;
    bgError = null;
    try {
      const layout = await api.layouts.uploadBackground(layoutId, file);
      // Đường dẫn không đổi khi thay nền (background.png), nên phải phá bộ nhớ
      // đệm của trình duyệt, không thì vẫn hiện ảnh cũ.
      layoutBgFile.set(
        layout.backgroundFile ? `${FILES_BASE}${layout.backgroundFile}?v=${Date.now()}` : null
      );
    } catch (e) {
      bgError = e instanceof Error ? e.message : 'Tải ảnh nền thất bại';
    } finally {
      bgUploading = false;
    }
  }

  /** Gỡ nền của layout — file trên server bị xoá, kích thước layout giữ nguyên */
  async function removeLayoutBackground() {
    bgUploading = true;
    bgError = null;
    try {
      await api.layouts.deleteBackground(layoutId);
      layoutBgFile.set(null);
      confirmRemoveBg = false;
    } catch (e) {
      bgError = e instanceof Error ? e.message : 'Xóa ảnh nền thất bại';
    } finally {
      bgUploading = false;
    }
  }

  function onImportImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = layoutId ? 'image/png,image/jpeg,image/webp' : 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (layoutId) {
        await uploadLayoutBackground(file);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Warning: Image is larger than 5MB. This may slow down the application.');
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        backgroundPanelOpen.set(true); // nhập ảnh mới thì luôn hiện lại bảng chỉnh ảnh
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
        <h3 class="text-xs font-semibold text-gray-400 uppercase mb-2 mt-3">Draw</h3>
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'wall' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
          onclick={() => setTool('wall')}
        >
          <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'wall' ? 'bg-blue-100' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="10" y1="5" x2="10" y2="12"/><line x1="15" y1="12" x2="15" y2="19"/></svg>
          </div>
          <div class="text-left">
            <div class="font-medium">Wall <span class="text-gray-400 text-xs ml-1">W</span></div>
            <div class="text-xs text-gray-400">Draw boundary walls</div>
          </div>
        </button>

        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'zone' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
          onclick={() => setTool('zone')}
        >
          <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'zone' ? 'bg-blue-100' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
          </div>
          <div class="text-left">
            <div class="font-medium">Vùng</div>
            <div class="text-xs text-gray-400">Vẽ vùng thi công theo công đoạn</div>
          </div>
        </button>
        <p class="px-3 text-xs text-gray-500">Diện tích layout: <strong>{totalAreaM2.toFixed(2)} m²</strong></p>

        <button
          class="w-full mt-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
          onclick={runAutoArrange}
        >Tự động sắp xếp{$selectedZoneId ? ' (vùng đang chọn)' : ' (tất cả vùng)'}</button>
        {#if arrangeMsg}
          <p class="px-3 mt-1.5 text-xs {arrangeMsg.ok ? 'text-gray-500' : 'text-amber-600'}">{arrangeMsg.text}</p>
        {/if}

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
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-gray-50 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={bgUploading || !canEditBg}
          title={canEditBg ? undefined : 'Tài khoản của bạn không đổi được nền mặt bằng'}
          onclick={onImportImage}
        >
          <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
          </div>
          <div class="text-left">
            <div class="font-medium">{layoutId && $layoutBgFile ? 'Thay ảnh nền' : 'Import Image'}</div>
            <div class="text-xs text-gray-400">
              {#if bgUploading}Đang tải lên…{:else if layoutId}Ảnh nền mặt bằng (lưu trên server){:else}Floor plan background{/if}
            </div>
          </div>
        </button>

        {#if layoutId && $layoutBgFile && canEditBg}
          <div class="px-3 -mt-1 flex items-center gap-3">
            {#if confirmRemoveBg}
              <span class="text-xs text-gray-500">Xóa nền mặt bằng?</span>
              <button onclick={removeLayoutBackground} disabled={bgUploading} class="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">Xóa</button>
              <button onclick={() => (confirmRemoveBg = false)} class="text-xs text-gray-400 hover:text-gray-600">Hủy</button>
            {:else}
              <button onclick={() => (confirmRemoveBg = true)} class="text-xs text-gray-400 hover:text-red-600 transition-colors">Xóa nền</button>
            {/if}
          </div>
        {/if}

        {#if bgError}
          <p class="px-3 text-xs text-red-600" role="alert">{bgError}</p>
        {/if}

        <!-- Nhập sản phẩm từ DXF. Trước đây là nút tròn không nhãn ở góc dưới
             trái canvas và biến mất hẳn khi layout chưa có bản vẽ nền, nên
             không ai biết tính năng tồn tại. Giờ luôn hiện, chưa dùng được thì
             mờ đi và nói rõ lý do. -->
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {bgIsCad ? 'hover:bg-gray-50 text-gray-700' : 'text-gray-400 cursor-not-allowed'}"
          disabled={!bgIsCad}
          onclick={() => dxfImportOpen.set(true)}
          title={bgIsCad
            ? 'Đọc các block trong bản vẽ nền và đặt sản phẩm theo đúng vị trí trong CAD'
            : $layoutBgFile
              ? 'Nền hiện tại là ảnh — chỉ bản vẽ DXF/DWG mới đọc được block'
              : 'Layout chưa có bản vẽ nền DXF/DWG — tải lên ở trang mặt bằng trước'}
        >
          <div class="w-9 h-9 rounded-lg flex items-center justify-center {bgIsCad ? 'bg-gray-100' : 'bg-gray-50'}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M12 12v6"/></svg>
          </div>
          <div class="text-left">
            <div class="font-medium">Nhập sản phẩm từ DXF</div>
            <div class="text-xs {bgIsCad ? 'text-gray-400' : 'text-gray-300'}">
              {bgIsCad ? 'Đặt block theo bản vẽ CAD' : 'Cần bản vẽ nền DXF/DWG'}
            </div>
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
                  draggable={!isExhausted(item)}
                  ondragstart={(e) => onItemDragStart(e, item)}
                  ondragend={() => draggingCatalogId.set(null)}
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
                  {#if thumbsReady >= 0 && thumbOf(item)}
                    <img src={thumbOf(item)} alt={item.name} class="w-10 h-10 object-contain" onerror={() => onThumbError(item.id)} />
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
            {@const elsewhere = elsewhereCount(item.id)}
            {@const qty = item.quantity ?? 1}
            {@const isFull = placed + elsewhere >= qty}
            <button
              class="relative flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors {notReady || isFull ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} {currentPlacing === item.id ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50'}"
              onclick={() => { if (currentPlacing === item.id || (!notReady && !isFull)) onFurnitureClick(item); }}
              disabled={(notReady || isFull) && currentPlacing !== item.id}
              draggable={!isExhausted(item)}
              ondragstart={(e) => onItemDragStart(e, item)}
              ondragend={() => draggingCatalogId.set(null)}
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
              {#if thumbsReady >= 0 && thumbOf(item)}
                <img src={thumbOf(item)} alt={item.name} class="w-12 h-12 object-contain" onerror={() => onThumbError(item.id)} />
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
              <span class="text-[10px] {isFull ? 'text-red-400 font-medium' : 'text-gray-400'}">{placed + elsewhere}/{qty}</span>
              {#if elsewhere > 0}
                <span class="text-[10px] text-amber-600" title={elsewhereWhere(item.id) ?? ''}>
                  {elsewhere} ở mặt bằng khác
                </span>
              {/if}
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
        {#if thumbsReady >= 0 && thumbOf(item)}
          <img src={thumbOf(item)} alt={item.name} class="max-w-full max-h-full object-contain" style="image-rendering: auto;" onerror={() => onThumbError(item.id)} />
        {:else}
          <div class="w-16 h-16 rounded-xl flex items-center justify-center" style="background-color: {item.color}20">
            <div class="w-10 h-10 rounded-md" style="background-color: {item.color}; opacity: 0.7"></div>
          </div>
        {/if}
      </div>
      <div class="p-3 space-y-1.5">
        <div class="flex items-start justify-between gap-2">
          <span class="min-w-0 text-sm font-semibold text-gray-800 break-words">{item.name}</span>
          <span
            class="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-white"
            style="background-color: {categoryColors[item.category] ?? '#6b7280'}"
          >{item.category}</span>
        </div>
        <div class="text-xs text-gray-500">
          {item.width} × {item.depth} × {item.height} cm
        </div>
        {#if elsewhereWhere(item.id)}
          <div class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Đang bố trí ở: {elsewhereWhere(item.id)}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

