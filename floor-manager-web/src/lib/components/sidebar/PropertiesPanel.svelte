<script lang="ts">
  import { activeFloor, selectedElementId, updateFurniture, updateWall, updateBackgroundImage, setBackgroundImage, calibrationMode, calibrationPoints, updateTextAnnotation, toggleFurnitureLock, updateEntourageItem, removeElement } from '$lib/stores/project';
  import { getCatalogItem } from '$lib/utils/furnitureCatalog';
  import { projectSettings } from '$lib/stores/settings';
  import type { BlockOrientation, Floor, FurnitureItem, TextAnnotation } from '$lib/models/types';
  import { orientedDims } from '$lib/services/mapping';
  import { api } from '$lib/services/api';
  import { loadProductCatalog } from '$lib/stores/productCatalog';
  import { propertiesPanelOpen, backgroundPanelOpen, layoutBgAlignMode, layoutBgPanelOpen } from '$lib/stores/ui';
  import { layoutBgFile, layoutBgTransform } from '$lib/stores/project';
  import { DEFAULT_LAYOUT_BG_TRANSFORM } from '$lib/utils/layoutBackground';
  import { stages, loadStages } from '$lib/stores/stages';

  loadStages();

  /** Chỉnh nền của layout — chỉ có nghĩa khi layout thực sự có nền */
  function setBgT(patch: Partial<typeof $layoutBgTransform>) {
    layoutBgTransform.update((t) => ({ ...t, ...patch }));
  }

  let stageSaving = $state(false);
  let stageError = $state<string | null>(null);
  import { wallLength } from '$lib/utils/canvasRenderer';

  let floor = $state<Floor | null>(null);
  let selId: string | null = $state(null);

  activeFloor.subscribe((f) => { floor = f; });
  selectedElementId.subscribe((id) => { selId = id; });

  let settings = $state($projectSettings);
  projectSettings.subscribe((s) => { settings = s; });

  function displayValue(cm: number): number {
    return settings.units === 'imperial' ? Math.round(cm / 2.54 * 10) / 10 : cm;
  }
  function inputToCm(value: number): number {
    return settings.units === 'imperial' ? value * 2.54 : value;
  }
  /** dd/MM HH:mm — đủ để biết "ai vừa động vào", không cần chi tiết hơn */
  function fmtWhen(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function unitLabel(): string {
    return settings.units === 'imperial' ? 'in' : 'cm';
  }

  let { is3D = false }: { is3D?: boolean } = $props();
  let selectedFurniture = $derived(floor?.furniture?.find(f => f.id === selId) ?? null);
  let selectedWall = $derived(floor?.walls?.find(w => w.id === selId) ?? null);
  let selectedTextAnnotation = $derived(floor?.textAnnotations?.find(t => t.id === selId) ?? null);
  let selectedEntourage = $derived(floor?.entourage?.find(en => en.id === selId) ?? null);
  // Công đoạn hiện tại của sản phẩm; giữ giá trị cũ/không có trong $stages để select không bị trắng.
  let currentStage = $derived(selectedFurniture ? (getCatalogItem(selectedFurniture.catalogId)?.processStage ?? 'Khác') : '');
  // Có ảnh nền là bảng tự bật; phải đóng được, không thì nó che bản vẽ vĩnh viễn.
  // Bấm lại vào ảnh trên canvas (hoặc nhập ảnh mới) sẽ mở lại.
  let hasBgImage = $derived(!!floor?.backgroundImage && $backgroundPanelOpen);

  // Wall handlers
  function onWallThickness(e: Event) {
    if (!selectedWall) return;
    const v = Math.max(1, inputToCm(Number((e.target as HTMLInputElement).value)) || 1);
    updateWall(selectedWall.id, { thickness: v });
  }
  function onWallHeight(e: Event) {
    if (!selectedWall) return;
    const v = Math.max(1, inputToCm(Number((e.target as HTMLInputElement).value)) || 1);
    updateWall(selectedWall.id, { height: v });
  }
  function onWallColor(e: Event) {
    if (!selectedWall) return;
    updateWall(selectedWall.id, { color: (e.target as HTMLInputElement).value });
  }

  // Furniture handlers
  function onFurnitureColor(color: string) {
    if (!selectedFurniture) return;
    updateFurniture(selectedFurniture.id, { color });
  }
  function onFurnitureWidth(e: Event) {
    if (!selectedFurniture) return;
    const v = Math.max(1, inputToCm(Number((e.target as HTMLInputElement).value)) || 1);
    updateFurniture(selectedFurniture.id, { width: v });
  }
  function onFurnitureDepth(e: Event) {
    if (!selectedFurniture) return;
    const v = Math.max(1, inputToCm(Number((e.target as HTMLInputElement).value)) || 1);
    updateFurniture(selectedFurniture.id, { depth: v });
  }
  function onFurnitureHeight(e: Event) {
    if (!selectedFurniture) return;
    const v = Math.max(1, inputToCm(Number((e.target as HTMLInputElement).value)) || 1);
    updateFurniture(selectedFurniture.id, { height: v });
  }
  function onFurnitureMaterial(e: Event) {
    if (!selectedFurniture) return;
    updateFurniture(selectedFurniture.id, { material: (e.target as HTMLSelectElement).value });
  }
  function onFurnitureRotation(e: Event) {
    if (!selectedFurniture) return;
    updateFurniture(selectedFurniture.id, { rotation: Number((e.target as HTMLInputElement).value) });
  }
  function onFurnitureElevation(e: Event) {
    if (!selectedFurniture) return;
    const raw = Number((e.target as HTMLInputElement).value);
    updateFurniture(selectedFurniture.id, {
      elevation: Math.max(0, inputToCm(Number.isFinite(raw) ? raw : 0)),
    });
  }

  /**
   * Công đoạn là thuộc tính của SẢN PHẨM, không của riêng block này — đổi ở
   * đây là đổi ở mọi mặt bằng đang dùng sản phẩm đó.
   */
  async function onProcessStage(e: Event) {
    if (!selectedFurniture) return;
    const stage = (e.target as HTMLSelectElement).value;
    const productId = selectedFurniture.catalogId;
    stageError = null;
    stageSaving = true;
    try {
      await api.products.update(productId, { processStage: stage });
      await loadProductCatalog(); // nạp lại để panel và sidebar hiện giá trị mới
    } catch (err) {
      stageError = err instanceof Error ? err.message : String(err);
    } finally {
      stageSaving = false;
    }
  }

  function resetFurnitureDefaults() {
    if (!selectedFurniture) return;
    updateFurniture(selectedFurniture.id, { color: undefined, width: undefined, depth: undefined, height: undefined, material: undefined, orientation: 'bottom', elevation: 0 });
  }

  /**
   * Đổi mặt tiếp sàn.
   *
   * Tư thế nào làm hoán vị W/D/H thì ghi đè kích thước; tư thế giữ nguyên ba
   * chiều (nằm đáy, lật úp) thì xoá override để block bám theo catalog — có
   * override thừa thì sửa kích thước sản phẩm sau này sẽ không ăn.
   */
  function setBlockOrientation(o: BlockOrientation) {
    if (!selectedFurniture) return;
    const def = getCatalogItem(selectedFurniture.catalogId);
    if (!def) return;
    const d = orientedDims(def, o);
    const sameAsCatalog = d.width === def.width && d.depth === def.depth && d.height === def.height;
    updateFurniture(
      selectedFurniture.id,
      sameAsCatalog
        ? { orientation: o, width: undefined, depth: undefined, height: undefined }
        : { orientation: o, width: d.width, depth: d.depth, height: d.height },
    );
  }

  // Nền layout ăn theo cùng cơ chế với ảnh nền của tầng: có cờ mở thì bảng hiện,
  // vì bản thân nền không phải phần tử chọn được. Không loại trừ 3D — phép căn
  // nền áp cho cả 3D nên chỉnh ở đó cũng có nghĩa.
  let hasLayoutBg = $derived(!!$layoutBgFile && $layoutBgPanelOpen);

  let hasSelection = $derived(!!selectedFurniture || !!selectedWall || !!selectedTextAnnotation || !!selectedEntourage || (!is3D && hasBgImage) || hasLayoutBg);

  // Bảng fixed nên nó đè lên mép phải khung 3D — báo để các nút nổi ở đó né ra
  $effect(() => {
    propertiesPanelOpen.set(hasSelection);
    return () => propertiesPanelOpen.set(false);
  });
</script>

<!-- Right sidebar on md+; slides up as a bottom sheet on phones -->
<div class="{is3D ? 'w-80' : 'w-64'} shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto p-3 fixed right-0 top-12 bottom-9 z-40 shadow-lg max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:w-full max-md:max-h-[45vh] max-md:border-l-0 max-md:border-t max-md:rounded-t-xl max-md:shadow-2xl" class:hidden={!hasSelection}>
  {#if selectedFurniture}
    <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
      <span class="w-6 h-6 bg-purple-100 rounded flex items-center justify-center text-xs">
        {getCatalogItem(selectedFurniture.catalogId)?.icon ?? '🪑'}
      </span>
      {getCatalogItem(selectedFurniture.catalogId)?.name ?? 'Furniture'} Properties
      <button
        onclick={() => { if (selectedFurniture) toggleFurnitureLock(selectedFurniture.id); }}
        class="ml-auto px-1.5 py-0.5 rounded text-xs border transition-colors {selectedFurniture.locked ? 'bg-amber-100 border-amber-400 text-amber-700' : 'border-gray-200 hover:bg-gray-50 text-gray-500'}"
        title={selectedFurniture.locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'}
      >{selectedFurniture.locked ? '🔒 Locked' : '🔓'}</button>
    </h3>
    <div class="space-y-3">
      <!-- Color -->
      <div>
        <div class="flex items-center gap-1 mb-2">
          <span class="text-xs text-gray-500">Color</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-400">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
          </svg>
        </div>
        <!-- Ô màu lấp đầy ô lưới: vùng bấm rộng gấp ~3 lần ô 24px trước đây,
             và khoảng cách đều nhau thay vì dồn về mép trái mỗi cột. -->
        <div class="grid grid-cols-5 gap-2 mb-2">
          {#each ['#ffffff', '#f5f5dc', '#d2b48c', '#daa520', '#8b4513', '#696969', '#191970', '#000000', '#dc143c', '#228b22'] as color}
            {@const active = (selectedFurniture.color ?? getCatalogItem(selectedFurniture.catalogId)?.color) === color}
            <button
              class="h-8 w-full rounded-md border-2 transition-colors hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 {active ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200'}"
              style="background-color: {color}"
              title={color}
              aria-label="Đổi màu block sang {color}"
              aria-pressed={active}
              onclick={() => onFurnitureColor(color)}
            ></button>
          {/each}
        </div>
        <label class="flex items-center gap-2">
          <span class="text-xs text-gray-500 shrink-0">Màu khác</span>
          <input
            type="color"
            value={selectedFurniture.color ?? getCatalogItem(selectedFurniture.catalogId)?.color ?? '#888888'}
            oninput={(e) => onFurnitureColor((e.target as HTMLInputElement).value)}
            class="h-8 flex-1 min-w-0 rounded-md border border-gray-200 cursor-pointer bg-white p-0.5"
          />
        </label>
      </div>
      
      <!-- Dimensions -->
      <label class="block">
        <span class="text-xs text-gray-500">Width ({unitLabel()})</span>
        <input 
          type="number" 
          value={displayValue(selectedFurniture.width ?? getCatalogItem(selectedFurniture.catalogId)?.width ?? 100)} 
          oninput={onFurnitureWidth} min="1"
          class="w-full px-2 py-1 border border-gray-200 rounded text-sm" 
        />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Depth ({unitLabel()})</span>
        <input 
          type="number" 
          value={displayValue(selectedFurniture.depth ?? getCatalogItem(selectedFurniture.catalogId)?.depth ?? 80)} 
          oninput={onFurnitureDepth} min="1"
          class="w-full px-2 py-1 border border-gray-200 rounded text-sm" 
        />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Height ({unitLabel()})</span>
        <input 
          type="number" 
          value={displayValue(selectedFurniture.height ?? getCatalogItem(selectedFurniture.catalogId)?.height ?? 80)} 
          oninput={onFurnitureHeight} min="1"
          class="w-full px-2 py-1 border border-gray-200 rounded text-sm" 
        />
      </label>
      
      <!-- Material -->
      <label class="block">
        <span class="text-xs text-gray-500">Material</span>
        <select 
          value={selectedFurniture.material ?? 'Wood'} 
          onchange={onFurnitureMaterial} 
          class="w-full px-2 py-1 border border-gray-200 rounded text-sm"
        >
          <option value="Wood">Wood</option>
          <option value="Metal">Metal</option>
          <option value="Fabric">Fabric</option>
          <option value="Leather">Leather</option>
          <option value="Glass">Glass</option>
          <option value="Plastic">Plastic</option>
          <option value="Stone">Stone</option>
          <option value="Ceramic">Ceramic</option>
        </select>
      </label>
      
      <!-- Rotation -->
      <label class="block">
        <span class="text-xs text-gray-500">Rotation (degrees)</span>
        <input 
          type="number" 
          value={Math.round(selectedFurniture.rotation * 100) / 100} 
          oninput={onFurnitureRotation} 
          class="w-full px-2 py-1 border border-gray-200 rounded text-sm" 
        />
      </label>

      {#if selectedFurniture.updatedBy}
        <div class="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded px-2 py-1">
          Thao tác cuối: <span class="text-gray-600">{selectedFurniture.updatedBy}</span>
          {#if selectedFurniture.updatedAt}
            <span class="text-gray-400"> · {fmtWhen(selectedFurniture.updatedAt)}</span>
          {/if}
        </div>
      {/if}

      <label class="block">
        <span class="text-xs text-gray-500">Cao độ đáy block ({unitLabel()})</span>
        <input
          type="number"
          min="0"
          step="10"
          value={displayValue(Math.round(selectedFurniture.elevation ?? 0))}
          oninput={onFurnitureElevation}
          class="w-full px-2 py-1 border border-gray-200 rounded text-sm"
        />
        <span class="text-[11px] text-gray-400">0 = đặt trực tiếp xuống sàn. Chỉ thấy ở chế độ 3D.</span>
      </label>

      <!-- Mặt tiếp sàn (lật block) -->
      <div class="block">
        <span class="text-xs text-gray-500">Mặt tiếp sàn (lật block)</span>
        <div class="grid grid-cols-2 gap-1 mt-1">
          {#each [
            { o: 'bottom', label: '⬓ Đáy', hint: 'Đặt đáy xuống sàn (mặc định)' },
            { o: 'top', label: '⬒ Úp', hint: 'Lật úp — mặt trên chạm sàn' },
            { o: 'side', label: '◨ Nghiêng', hint: 'Lật nằm nghiêng — mặt bên chạm sàn' },
            { o: 'side2', label: '◧ Nghiêng 2', hint: 'Lật nghiêng — mặt bên đối diện chạm sàn' },
            { o: 'end', label: '▯ Dựng', hint: 'Dựng đứng — mặt đầu chạm sàn' },
            { o: 'end2', label: '▮ Dựng 2', hint: 'Dựng đứng — mặt đầu đối diện chạm sàn' },
          ] as opt}
            <button
              onclick={() => setBlockOrientation(opt.o as BlockOrientation)}
              class="px-1 py-1.5 border rounded text-xs transition-colors {(selectedFurniture.orientation ?? 'bottom') === opt.o ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}"
              title={opt.hint}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

      <!-- Công đoạn sản xuất (thuộc tính của sản phẩm) -->
      <label class="block">
        <span class="text-xs text-gray-500">Công đoạn sản xuất</span>
        <select
          value={currentStage}
          disabled={stageSaving}
          onchange={onProcessStage}
          class="w-full px-2 py-1 border border-gray-200 rounded text-sm bg-white disabled:opacity-50"
        >
          {#if currentStage && !$stages.some((s) => s.name === currentStage)}
            <option value={currentStage}>{currentStage} (cũ)</option>
          {/if}
          {#each $stages as st (st.id)}<option value={st.name}>{st.name}</option>{/each}
        </select>
        <span class="text-[11px] text-gray-400">
          Áp dụng cho cả sản phẩm — mọi mặt bằng đang dùng đều đổi theo.
        </span>
        {#if stageError}
          <span class="block text-[11px] text-red-600 mt-0.5">{stageError}</span>
        {/if}
      </label>

      <!-- Khoảng cách (margin) riêng của block; trống = dùng mặc định toàn hệ -->
      <label class="block">
        <span class="text-xs text-gray-500">Khoảng cách (margin, cm) — trống = mặc định</span>
        <input type="number" min="0"
          value={selectedFurniture.marginCm ?? ''}
          onchange={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            updateFurniture(selectedFurniture.id, { marginCm: v === '' ? undefined : Number(v) });
          }}
          class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
      </label>

      <!-- Rotate controls. Flip H/V đã bỏ: soi gương một khối thép không có
           nghĩa vật lý, và với block hộp đối xứng thì bấm xong không đổi gì. -->
      <div class="flex gap-1">
        <button
          onclick={() => { if (selectedFurniture) updateFurniture(selectedFurniture.id, { rotation: selectedFurniture.rotation - 90 }); }}
          class="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm hover:bg-gray-50 transition-colors"
          title="Xoay 90° ngược chiều kim đồng hồ"
        >↺ 90°</button>
        <button
          onclick={() => { if (selectedFurniture) updateFurniture(selectedFurniture.id, { rotation: selectedFurniture.rotation + 90 }); }}
          class="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm hover:bg-gray-50 transition-colors"
          title="Xoay 90° thuận chiều kim đồng hồ"
        >↻ 90°</button>
      </div>
      
      <!-- Reset button -->
      <button
        onclick={resetFurnitureDefaults}
        class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        Reset to defaults
      </button>
    </div>

  {:else if selectedEntourage}
    <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
      <span class="w-6 h-6 bg-green-100 rounded flex items-center justify-center text-xs">🌳</span>
      Entourage
    </h3>
    <div class="space-y-3">
      <label class="block">
        <span class="text-xs text-gray-500">Width ({unitLabel()})</span>
        <input type="number" value={displayValue(Math.round(selectedEntourage.width))} oninput={(e) => { if (selectedEntourage) updateEntourageItem(selectedEntourage.id, { width: Math.max(1, inputToCm(Number((e.target as HTMLInputElement).value)) || 1) }); }} min="1" class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Rotation (°)</span>
        <input type="number" value={Math.round(selectedEntourage.rotation || 0)} oninput={(e) => { if (selectedEntourage) updateEntourageItem(selectedEntourage.id, { rotation: Number((e.target as HTMLInputElement).value) || 0 }); }} step="15" class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Opacity ({Math.round((selectedEntourage.opacity ?? 1) * 100)}%)</span>
        <input type="range" min="0.1" max="1" step="0.05" value={selectedEntourage.opacity ?? 1} oninput={(e) => { if (selectedEntourage) updateEntourageItem(selectedEntourage.id, { opacity: Number((e.target as HTMLInputElement).value) }); }} class="w-full" />
      </label>
      <div class="flex gap-2">
        <button onclick={() => { if (selectedEntourage) updateEntourageItem(selectedEntourage.id, { locked: !selectedEntourage.locked }); }} class="flex-1 px-2 py-1.5 border rounded text-sm transition-colors {selectedEntourage.locked ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 hover:bg-gray-50'}">{selectedEntourage.locked ? '🔒 Locked' : '🔓 Unlocked'}</button>
        <button onclick={() => { if (selectedEntourage) { removeElement(selectedEntourage.id); selectedElementId.set(null); } }} class="flex-1 px-2 py-1.5 border border-red-200 text-red-600 rounded text-sm hover:bg-red-50 transition-colors">Delete</button>
      </div>
    </div>

  {:else if selectedWall}
    <div class="space-y-3">
      <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <span class="w-6 h-6 bg-slate-200 rounded flex items-center justify-center text-xs">🧱</span>
        Tường
      </h3>
      <div class="text-xs text-gray-400">
        Dài {displayValue(Math.round(wallLength(selectedWall)))} {unitLabel()}
        {#if selectedWall.curvePoint}<span class="ml-1">(cong)</span>{/if}
      </div>
      <label class="block">
        <span class="text-xs text-gray-500">Độ dày ({unitLabel()})</span>
        <input type="number" min="1" value={displayValue(selectedWall.thickness)} oninput={onWallThickness} class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Chiều cao ({unitLabel()})</span>
        <input type="number" min="1" value={displayValue(selectedWall.height)} oninput={onWallHeight} class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Màu</span>
        <div class="flex items-center gap-2">
          <input type="color" value={selectedWall.color} oninput={onWallColor} class="w-8 h-6 rounded border border-gray-200 cursor-pointer" />
          <span class="text-xs text-gray-400">{selectedWall.color}</span>
        </div>
      </label>
      <button
        onclick={() => { if (selectedWall) { removeElement(selectedWall.id); selectedElementId.set(null); } }}
        class="w-full px-2 py-1.5 border border-red-200 text-red-600 rounded text-sm hover:bg-red-50 transition-colors"
      >Xoá tường</button>
    </div>

  {:else if selectedTextAnnotation}
    <div class="space-y-3">
      <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <span class="w-6 h-6 bg-emerald-100 rounded flex items-center justify-center text-xs">🏷️</span>
        Text Annotation
      </h3>
      <label class="block">
        <span class="text-xs text-gray-500">Text</span>
        <input type="text" value={selectedTextAnnotation.text} oninput={(e) => updateTextAnnotation(selectedTextAnnotation!.id, { text: (e.target as HTMLInputElement).value })} class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Font Size</span>
        <input type="number" value={selectedTextAnnotation.fontSize} min="8" max="72" oninput={(e) => updateTextAnnotation(selectedTextAnnotation!.id, { fontSize: Number((e.target as HTMLInputElement).value) })} class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Color</span>
        <div class="flex items-center gap-2">
          <input type="color" value={selectedTextAnnotation.color} oninput={(e) => updateTextAnnotation(selectedTextAnnotation!.id, { color: (e.target as HTMLInputElement).value })} class="w-8 h-6 rounded border border-gray-200 cursor-pointer" />
          <span class="text-xs text-gray-400">{selectedTextAnnotation.color}</span>
        </div>
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Rotation (°)</span>
        <input type="number" value={selectedTextAnnotation.rotation} oninput={(e) => updateTextAnnotation(selectedTextAnnotation!.id, { rotation: Number((e.target as HTMLInputElement).value) })} class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">X</span>
        <input type="number" value={Math.round(selectedTextAnnotation.x)} oninput={(e) => updateTextAnnotation(selectedTextAnnotation!.id, { x: Number((e.target as HTMLInputElement).value) })} class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Y</span>
        <input type="number" value={Math.round(selectedTextAnnotation.y)} oninput={(e) => updateTextAnnotation(selectedTextAnnotation!.id, { y: Number((e.target as HTMLInputElement).value) })} class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
      </label>
    </div>
  {/if}

  <!-- Background Image Controls (always show when bg image exists) -->
  {#if hasBgImage && floor?.backgroundImage}
    <div class="mt-4 pt-3 border-t border-gray-200">
      <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <span class="w-6 h-6 bg-blue-100 rounded flex items-center justify-center text-xs">🖼️</span>
        Ảnh nền
        <button
          onclick={() => backgroundPanelOpen.set(false)}
          class="ml-auto w-6 h-6 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center text-base leading-none"
          title="Đóng bảng — bấm vào ảnh trên bản vẽ để mở lại"
          aria-label="Đóng bảng ảnh nền"
        >✕</button>
      </h3>
      <p class="text-xs text-gray-400 -mt-2 mb-3">Kéo ảnh trên bản vẽ để di chuyển. Khoá lại để tránh xê dịch.</p>
      <div class="space-y-3">
        <label class="block">
          <span class="text-xs text-gray-500">Opacity</span>
          <input type="range" min="0.05" max="1" step="0.05" value={floor.backgroundImage.opacity} oninput={(e) => updateBackgroundImage({ opacity: Number((e.target as HTMLInputElement).value) })} class="w-full" />
        </label>
        <label class="block">
          <span class="text-xs text-gray-500">Scale</span>
          <input type="range" min="0.1" max="5" step="0.05" value={floor.backgroundImage.scale} oninput={(e) => updateBackgroundImage({ scale: Number((e.target as HTMLInputElement).value) })} class="w-full" />
        </label>
        <label class="block">
          <span class="text-xs text-gray-500">Rotation</span>
          <input type="number" value={floor.backgroundImage.rotation} oninput={(e) => updateBackgroundImage({ rotation: Number((e.target as HTMLInputElement).value) })} class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
        </label>
        <div class="flex gap-2">
          <button
            onclick={() => updateBackgroundImage({ locked: !floor!.backgroundImage!.locked })}
            class="flex-1 px-2 py-1.5 border rounded text-sm {floor.backgroundImage.locked ? 'bg-amber-100 border-amber-400 text-amber-700' : 'border-gray-200 hover:bg-gray-50'}"
          >{floor.backgroundImage.locked ? '🔒 Locked' : '🔓 Unlocked'}</button>
          <button
            onclick={() => { calibrationPoints.set([]); calibrationMode.set(true); }}
            class="flex-1 px-2 py-1.5 border rounded text-sm border-gray-200 hover:bg-gray-50"
          >📏 Set Scale</button>
        </div>
        <button
          onclick={() => setBackgroundImage(undefined)}
          class="w-full px-2 py-1.5 border border-red-300 rounded text-sm text-red-600 hover:bg-red-50"
        >Remove Image</button>
      </div>
    </div>
  {/if}

  {#if hasLayoutBg}
    <div class="mt-4 pt-3 border-t border-gray-200">
      <h3 class="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
        <span class="w-6 h-6 bg-emerald-100 rounded flex items-center justify-center text-xs">🗺️</span>
        Nền mặt bằng
        <button
          onclick={() => { layoutBgPanelOpen.set(false); layoutBgAlignMode.set(false); }}
          class="ml-auto w-6 h-6 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center text-base leading-none"
          title="Đóng bảng — bấm vào nền trên bản vẽ để mở lại"
          aria-label="Đóng bảng nền mặt bằng"
        >✕</button>
      </h3>
      <p class="text-xs text-gray-400 mb-3">Căn nền cho khớp block. Áp dụng cho cả 2D, 3D và bản in.</p>

      <button
        onclick={() => layoutBgAlignMode.update((v) => !v)}
        class="w-full mb-3 px-2 py-1.5 border rounded text-sm {$layoutBgAlignMode ? 'bg-emerald-100 border-emerald-400 text-emerald-700' : 'border-gray-200 hover:bg-gray-50'}"
      >{$layoutBgAlignMode ? '✋ Đang căn nền — kéo trên bản vẽ' : '✋ Bật kéo nền'}</button>

      <div class="space-y-3">
        <label class="block">
          <span class="text-xs text-gray-500">Độ mờ · {Math.round($layoutBgTransform.opacity * 100)}%</span>
          <input type="range" min="0.05" max="1" step="0.05" value={$layoutBgTransform.opacity}
            oninput={(e) => setBgT({ opacity: Number((e.target as HTMLInputElement).value) })} class="w-full" />
        </label>
        <label class="block">
          <span class="text-xs text-gray-500">Tỉ lệ · {$layoutBgTransform.scale.toFixed(2)}×</span>
          <input type="range" min="0.2" max="3" step="0.01" value={$layoutBgTransform.scale}
            oninput={(e) => setBgT({ scale: Number((e.target as HTMLInputElement).value) })} class="w-full" />
        </label>
        <label class="block">
          <span class="text-xs text-gray-500">Xoay (độ)</span>
          <input type="number" step="0.5" value={$layoutBgTransform.rotationDeg}
            oninput={(e) => setBgT({ rotationDeg: Number((e.target as HTMLInputElement).value) })}
            class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-xs text-gray-500">Dịch X (cm)</span>
            <input type="number" step="10" value={Math.round($layoutBgTransform.offsetXCm)}
              oninput={(e) => setBgT({ offsetXCm: Number((e.target as HTMLInputElement).value) })}
              class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
          </label>
          <label class="block">
            <span class="text-xs text-gray-500">Dịch Y (cm)</span>
            <input type="number" step="10" value={Math.round($layoutBgTransform.offsetYCm)}
              oninput={(e) => setBgT({ offsetYCm: Number((e.target as HTMLInputElement).value) })}
              class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
          </label>
        </div>
        <button
          onclick={() => layoutBgTransform.set({ ...DEFAULT_LAYOUT_BG_TRANSFORM })}
          class="w-full px-2 py-1.5 border border-gray-200 rounded text-sm hover:bg-gray-50"
        >Đặt lại về khung layout</button>
      </div>
    </div>
  {/if}
</div>
