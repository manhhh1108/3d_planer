<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { currentProject, viewMode, selectedElementId, selectedRoomId, createDefaultProject, loadProject, selectedTool, placingFurnitureId, elevationWallId, elevationPickMode, layoutBgFile, layoutDimsCm, layoutBgTransform } from '$lib/stores/project';
  import { localStore, backendStore, setActiveStore } from '$lib/services/datastore';
  import { api, FILES_BASE, type ApiPlan, type ApiPlanItem, type ApiConflictResult, type ApiComment } from '$lib/services/api';
  import { currentUser, canEdit } from '$lib/stores/auth';
  import CommentPanel from '$lib/components/editor/CommentPanel.svelte';
  import ComparisonOverlay from '$lib/components/editor/ComparisonOverlay.svelte';
  import PlanToolbar from '$lib/components/editor/PlanToolbar.svelte';
  import GanttChart from '$lib/components/editor/GanttChart.svelte';
  import ConflictPanel from '$lib/components/editor/ConflictPanel.svelte';
  import PlanProductSidebar from '$lib/components/editor/PlanProductSidebar.svelte';
  import { applyWithoutDirty, markClean, resetWorkingDate, workingDate } from '$lib/stores/saveStatus';
  import { dxfImportOpen } from '$lib/stores/ui';
  import { startEditLock, stopEditLock, editLock, lockedByOther } from '$lib/stores/editLock';
  import { todayStr } from '$lib/services/mapping';
  import { normalizeLayoutBgTransform } from '$lib/utils/layoutBackground';
  import TopBar from '$lib/components/toolbar/TopBar.svelte';
  import BuildPanel from '$lib/components/sidebar/BuildPanel.svelte';
  import PropertiesPanel from '$lib/components/sidebar/PropertiesPanel.svelte';
  import LayersPanel from '$lib/components/sidebar/LayersPanel.svelte';

  let showLayers = $state(false);
  import FloorPlanCanvas from '$lib/components/editor/FloorPlanCanvas.svelte';
  import AlignmentToolbar from '$lib/components/editor/AlignmentToolbar.svelte';
  import UndoHistoryPanel from '$lib/components/editor/UndoHistoryPanel.svelte';
  import CommandPalette from '$lib/components/editor/CommandPalette.svelte';
  import TimelineBar from '$lib/components/editor/TimelineBar.svelte';
  import { timelineDate } from '$lib/stores/timeline';
  import PrintLayout from '$lib/components/editor/PrintLayout.svelte';
  import DxfImportPanel from '$lib/components/editor/DxfImportPanel.svelte';
  import OnboardingTooltip from '$lib/components/OnboardingTooltip.svelte';
  import { triggerTip } from '$lib/stores/onboarding.svelte';

  // Căn nền: người dùng kéo/chỉnh liên tục nên gom lại rồi mới ghi, khỏi bắn
  // một request mỗi lần nhích chuột. Chỉ ghi sau khi đã nạp xong giá trị của
  // layout, không thì lần set đầu tiên lúc load lại ghi ngược lên server.
  let bgTransformReady = false;
  let lastSavedBgTransform = '';
  let bgSaveTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const t = $layoutBgTransform;
    if (!backendLayoutId || !bgTransformReady) return;
    const json = JSON.stringify(t);
    if (json === lastSavedBgTransform) return;
    if (bgSaveTimer) clearTimeout(bgSaveTimer);
    const id = backendLayoutId;
    bgSaveTimer = setTimeout(async () => {
      try {
        await api.layouts.update(id, { bgTransform: t });
        lastSavedBgTransform = json;
      } catch (e) {
        console.error('[editor] Không lưu được căn ảnh nền:', e);
      }
    }, 500);
  });

  let commandPaletteOpen = $state(false);
  let printOpen = $state(false);

  // Lazy-load ThreeViewer to avoid loading Three.js (~1.4MB) until 3D mode is activated
  let ThreeViewer: any = $state(null);
  $effect(() => {
    if (mode === '3d' && !ThreeViewer) {
      import('$lib/components/viewer3d/ThreeViewer.svelte').then(m => { ThreeViewer = m.default; });
    }
  });

  let mode = $state<'2d' | '3d'>('2d');
  let ready = $state(false);
  let showHelp = $state(false);
  let showUndoHistory = $state(false);

  // Mobile (< md): BuildPanel becomes an off-canvas drawer toggled by the Tools FAB.
  let buildPanelOpen = $state(false);
  // Close the drawer once the user has picked a tool / item so the canvas is usable
  selectedTool.subscribe(() => { if (buildPanelOpen) buildPanelOpen = false; });
  placingFurnitureId.subscribe((id) => { if (id && buildPanelOpen) buildPanelOpen = false; });

  viewMode.subscribe((m) => {
    mode = m;
    if (m === '3d') {
      // Clear selection when entering 3D — start in view-only mode
      selectedElementId.set(null);
      selectedRoomId.set(null);
      elevationPickMode.set(false);
      // Onboarding tip for first 3D view
      triggerTip('first-3d', 200, 80);
    }
  });

  let loadError = $state<string | null>(null);
  let backendLayoutId = $state<string | null>(null);
  let printSiteName = $state('');
  let printLayoutName = $state('');
  // Khung tên bản vẽ lấy từ mặt bằng, không bắt gõ lại mỗi lần xuất PDF
  let printCompanyName = $state('');
  let printCompanyLogo = $state('');
  // Đích của nút quay lại trên TopBar: mặt bằng chứa layout đang mở.
  // Chưa biết layout thuộc mặt bằng nào thì về trang chủ.
  let backHref = $state(base || '/');
  let backLabel = $state('Trang chủ');

  let comments = $state<ApiComment[]>([]);
  let showComments = $state(false);

  async function loadComments() {
    if (!backendLayoutId) return;
    try {
      comments = await api.comments.list(backendLayoutId);
    } catch {
      // không block editor nếu comments fail
    }
  }

  let activeTab = $state<'layout' | 'planning'>('layout');
  let showComparison = $state(false);
  let plans = $state<ApiPlan[]>([]);
  let selectedPlanId = $state<string | null>(null);
  let planItems = $state<ApiPlanItem[]>([]);
  let conflictResult = $state<ApiConflictResult | null>(null);

  let selectedPlanVersion = $derived(plans.find(p => p.id === selectedPlanId)?.version ?? 1);

  async function loadPlans() {
    if (!backendLayoutId) return;
    plans = await api.plans.list(backendLayoutId);
    if (plans.length > 0 && !selectedPlanId) selectedPlanId = plans[0].id;
    if (selectedPlanId) await loadPlanItems();
  }

  async function loadPlanItems() {
    if (!selectedPlanId) { planItems = []; conflictResult = null; return; }
    plans = await api.plans.list(backendLayoutId!);
    planItems = await api.plans.items(selectedPlanId);
    conflictResult = await api.plans.conflicts(selectedPlanId);
  }

  onMount(() => {
    (async () => {
      const url = new URL(window.location.href);

      const layoutId = url.searchParams.get('layoutId');
      if (layoutId) {
        // Chế độ backend: 1 layout của backend = 1 project của editor
        backendLayoutId = layoutId;
        setActiveStore(backendStore);
        // Reset background stores so stale data from a previous layout never leaks in
        layoutBgFile.set(null);
        layoutDimsCm.set({ widthCm: 0, heightCm: 0 });
        bgTransformReady = false;
        layoutBgTransform.set(normalizeLayoutBgTransform(null));
        try {
          const project = await backendStore.load(layoutId);
          if (!project) throw new Error('Không tìm thấy layout');
          applyWithoutDirty(() => currentProject.set(project));
          // Load layout metadata for canvas background
          try {
            const layout = await api.layouts.get(layoutId);
            printLayoutName = layout.name;
            layoutBgFile.set(layout.backgroundFile ? `${FILES_BASE}${layout.backgroundFile}` : null);
            layoutDimsCm.set({ widthCm: layout.widthM * 100, heightCm: layout.heightM * 100 });
            const bgT = normalizeLayoutBgTransform(layout.bgTransform);
            lastSavedBgTransform = JSON.stringify(bgT);
            layoutBgTransform.set(bgT);
            bgTransformReady = true;
            if (layout.siteId) {
              backHref = `${base}/site/${layout.siteId}`;
              try {
                const site = await api.sites.get(layout.siteId);
                backLabel = site.name;
                printSiteName = site.name;
                printCompanyName = site.companyName ?? '';
                printCompanyLogo = site.companyLogo ?? '';
              } catch {
                backLabel = 'Mặt bằng';
                printSiteName = 'Mặt bằng';
              }
            }
          } catch {
            // non-critical: background won't show but editor still works
          }
          // Mở layout mới thì soạn cho hôm nay, không mang theo ngày của layout trước
          timelineDate.set(null);
          resetWorkingDate();
          markClean();
        } catch (e: any) {
          loadError = e?.message ?? 'Không tải được layout từ server';
        }
        ready = true;
        await loadComments();
        return;
      }

      // Chế độ local (demo/offline) như bản gốc
      setActiveStore(localStore);
      const id = url.searchParams.get('id');
      if (id) {
        const project = await localStore.load(id);
        if (project) {
          applyWithoutDirty(() => currentProject.set(project));
        } else {
          const p = createDefaultProject();
          currentProject.set(p);
          await localStore.save(p);
          history.replaceState(null, '', `/editor?id=${p.id}`);
        }
      } else {
        const p = createDefaultProject();
        currentProject.set(p);
        await localStore.save(p);
        history.replaceState(null, '', `/editor?id=${p.id}`);
      }
      ready = true;
    })();

    // Khoá chỉnh sửa bám theo (layout, ngày đang soạn). Đổi ngày = khoá khác,
    // vì hai người soạn hai ngày khác nhau thì không đụng nhau.
    const unsubLock = workingDate.subscribe((d) => {
      if (backendLayoutId) startEditLock(backendLayoutId, d ?? todayStr());
    });
    const releaseOnLeave = () => stopEditLock();
    window.addEventListener('pagehide', releaseOnLeave);

    return () => {
      unsubLock();
      window.removeEventListener('pagehide', releaseOnLeave);
      stopEditLock();
    };
  });
</script>

<svelte:head><title>{$currentProject?.name ? `${$currentProject.name} — Floor Manager` : 'Editor — Floor Manager'}</title></svelte:head>

<svelte:window on:keydown={(e) => { if (e.key === 'p' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); printOpen = true; } if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !e.ctrlKey && !e.metaKey && (e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA')) { e.preventDefault(); commandPaletteOpen = !commandPaletteOpen; } if (e.key === '?' && !e.ctrlKey && !e.metaKey) { showHelp = !showHelp; e.preventDefault(); } if (e.key === 'Escape' && showHelp) { showHelp = false; } if (e.key === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey && (e.target as HTMLElement)?.tagName !== 'INPUT') { showLayers = !showLayers; } }} />

{#if ready}
  <div class="h-screen flex flex-col overflow-hidden">
    <TopBar saveLabel={backendLayoutId ? 'Lưu Snapshot' : 'Save'} {backHref} {backLabel} />
    {#if backendLayoutId}
      <div class="flex border-b border-gray-200 bg-white px-4">
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'layout' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
          onclick={() => activeTab = 'layout'}
        >Bố trí</button>
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'planning' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
          onclick={() => { activeTab = 'planning'; loadPlans(); }}
        >Kế hoạch</button>
        <div class="ml-auto flex items-center gap-2">
          <button
            onclick={() => (showComments = !showComments)}
            class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors {showComments
              ? 'bg-blue-100 text-blue-600'
              : 'text-gray-600 hover:bg-gray-100'}"
          >
            💬{comments.length > 0 ? ` (${comments.length})` : ''}
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors {showComparison ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
            onclick={() => showComparison = !showComparison}
          >So sánh KH/TT</button>
        </div>
      </div>
    {/if}
    {#if $lockedByOther}
      <div class="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-sm">
        <span class="text-amber-600 text-base">⚠</span>
        <span class="text-amber-800">
          <strong>{$editLock.holder?.name ?? 'Người khác'}</strong> đang chỉnh sửa mặt bằng này.
          Bạn vẫn xem và thử bố trí được, nhưng <strong>chưa lưu được</strong> cho tới khi họ xong.
        </span>
      </div>
    {/if}
    {#if activeTab === 'layout' || !backendLayoutId}
      <div class="flex flex-1 overflow-hidden">
          <!-- Build panel: inline sidebar on md+, off-canvas drawer on phones -->
          {#if buildPanelOpen}
            <div
              class="md:hidden fixed inset-x-0 top-12 bottom-0 bg-black/40 z-40"
              onclick={() => buildPanelOpen = false}
              aria-hidden="true"
            ></div>
          {/if}
          <div class="h-full max-md:fixed max-md:left-0 max-md:top-12 max-md:bottom-0 max-md:h-auto max-md:z-50 max-md:shadow-2xl max-md:transition-transform max-md:duration-200 {buildPanelOpen ? '' : 'max-md:-translate-x-full'}">
            <BuildPanel layoutId={backendLayoutId ?? ''} />
          </div>
        <div class="flex-1 min-w-0 relative">
          {#if mode === '2d'}
            <FloorPlanCanvas />
            <AlignmentToolbar />
          {:else}
            {#if ThreeViewer}
              <ThreeViewer />
            {:else}
              <div class="flex items-center justify-center h-full text-slate-400">Loading 3D viewer…</div>
            {/if}
          {/if}
        </div>
        {#if showLayers && mode === '2d'}
          <LayersPanel />
        {/if}
        <PropertiesPanel is3D={mode === '3d'} />
        {#if showComments && backendLayoutId}
          <div class="w-72 flex-shrink-0 border-l border-gray-200 flex flex-col overflow-hidden">
            <CommentPanel
              layoutId={backendLayoutId}
              {comments}
              currentUserEmail={$currentUser?.email ?? ''}
              canEdit={$canEdit}
              onRefresh={loadComments}
            />
          </div>
        {/if}
        <ComparisonOverlay layoutId={backendLayoutId ?? ''} show={showComparison} onClose={() => showComparison = false} />
      </div>
      {#if backendLayoutId}
        <TimelineBar layoutId={backendLayoutId} />
      {/if}
    {:else}
      <!-- Planning tab -->
      <div class="flex flex-1 overflow-hidden">
        <PlanProductSidebar />
        <div class="flex flex-1 overflow-hidden flex-col">
        <PlanToolbar
          {plans}
          {selectedPlanId}
          layoutId={backendLayoutId}
          onSelectPlan={(id) => { selectedPlanId = id; loadPlanItems(); }}
          onPlansChanged={loadPlans}
        />
        <GanttChart
          items={planItems}
          planId={selectedPlanId}
          planVersion={selectedPlanVersion}
          conflicts={conflictResult?.conflicts ?? []}
          onItemsChanged={loadPlanItems}
        />
        <ConflictPanel
          conflicts={conflictResult?.conflicts ?? []}
          suggestions={conflictResult?.suggestions ?? []}
          planId={selectedPlanId}
          onApplySuggestion={loadPlanItems}
        />
        </div>
      </div>
    {/if}
  </div>

  <!-- Tools drawer FAB (mobile only) -->
  {#if mode === '2d'}
    <button
      class="md:hidden fixed {backendLayoutId ? 'bottom-16' : 'bottom-4'} left-4 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg active:bg-blue-700 transition-colors z-40 flex items-center justify-center"
      onclick={() => buildPanelOpen = !buildPanelOpen}
      title="Tools"
      aria-label="Toggle tools panel"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    </button>
  {/if}

  <!-- Layers toggle button -->
  {#if mode === '2d'}
    <button
      class="max-md:hidden fixed {backendLayoutId ? 'bottom-16' : 'bottom-4'} left-14 w-8 h-8 rounded-full shadow-lg hover:bg-slate-600 transition-colors z-50 text-sm"
      class:bg-blue-600={showLayers}
      class:text-white={showLayers}
      class:bg-slate-700={!showLayers}
      class:text-gray-300={!showLayers}
      onclick={() => showLayers = !showLayers}
      title="Layers Panel (L)"
      aria-label="Toggle Layers Panel"
    >🗂</button>
  {/if}

  <!-- Undo History toggle button -->
  <button
    class="max-md:hidden fixed {backendLayoutId ? 'bottom-16' : 'bottom-4'} left-24 w-8 h-8 rounded-full shadow-lg hover:bg-slate-600 transition-colors z-50 text-sm"
    class:bg-blue-600={showUndoHistory}
    class:text-white={showUndoHistory}
    class:bg-slate-700={!showUndoHistory}
    class:text-gray-300={!showUndoHistory}
    onclick={() => showUndoHistory = !showUndoHistory}
    title="Undo History"
    aria-label="Toggle Undo History"
  >⟲</button>

  <UndoHistoryPanel bind:visible={showUndoHistory} />

  <!-- Help button (desktop only — keyboard shortcuts are meaningless on touch) -->
  <button
    class="max-md:hidden fixed {backendLayoutId ? 'bottom-16' : 'bottom-4'} left-4 w-8 h-8 rounded-full bg-slate-700 text-white text-sm font-bold shadow-lg hover:bg-slate-600 transition-colors z-50"
    onclick={() => showHelp = !showHelp}
    title="Keyboard Shortcuts (?)"
    aria-label="Keyboard Shortcuts"
  >?</button>

  <!-- Shortcuts overlay -->
  {#if showHelp}
    {@const shortcutsCopied = { value: false }}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => showHelp = false} onkeydown={(e) => { if (e.key === 'Escape') showHelp = false; }} role="dialog" tabindex="-1" aria-label="Keyboard Shortcuts">
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"/></svg>
            <h2 class="text-lg font-bold text-slate-800">Keyboard Shortcuts</h2>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 transition-colors flex items-center gap-1.5"
              onclick={() => {
                const text = [
                  'KEYBOARD SHORTCUTS — Open3D Floorplan',
                  '',
                  '── TOOLS ──',
                  'V          Select tool',
                  'W          Wall tool',
                  'D          Door tool',
                  'H          Pan mode',
                  'M          Measure tool',
                  'N          Annotate tool',
                  'T          Text tool',
                  'S          Toggle snap',
                  '',
                  '── EDIT ──',
                  'Ctrl+Z     Undo',
                  'Ctrl+Y     Redo',
                  'Ctrl+C     Copy',
                  'Ctrl+V     Paste',
                  'Ctrl+A     Select all',
                  'Ctrl+D     Deselect all',
                  'Ctrl+S     Save project',
                  'Esc        Cancel / Deselect',
                  '',
                  '── ELEMENTS ──',
                  'R          Rotate element',
                  'Del/Back   Delete selected',
                  'Ctrl+L     Lock/Unlock',
                  'Ctrl+G     Group selection',
                  'Ctrl+⇧+G   Ungroup',
                  '',
                  '── VIEW ──',
                  'Tab        Toggle 2D/3D',
                  'F          Zoom to fit',
                  'G          Toggle grid',
                  'L          Toggle layers',
                  '?          Show shortcuts',
                  '',
                  '── CANVAS ──',
                  'Scroll     Zoom in/out',
                  '+/-        Zoom in/out',
                  'Space+Drag Pan canvas',
                  '',
                  '── WALLS ──',
                  'Dbl-click  Finish wall chain',
                  'C          Close wall loop',
                ].join('\n');
                navigator.clipboard.writeText(text);
              }}
              aria-label="Copy all shortcuts"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              Copy All
            </button>
            <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" onclick={() => showHelp = false} aria-label="Close shortcuts">✕</button>
          </div>
        </div>

        <!-- Body -->
        <div class="overflow-y-auto px-6 py-4">
          <div class="grid grid-cols-2 gap-x-8 gap-y-0 text-sm">
            <!-- Left column -->
            <div>
              <!-- Tools -->
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs font-bold uppercase tracking-wider text-indigo-500">Tools</span>
                <div class="flex-1 h-px bg-indigo-100"></div>
              </div>
              <div class="space-y-1.5 mb-5">
                <div class="flex justify-between"><span class="text-gray-600">Select tool</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">V</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Wall tool</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">W</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Door tool</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">D</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Pan mode</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">H</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Measure tool</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">M</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Annotate tool</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">N</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Text tool</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">T</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Toggle snap</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">S</kbd></div>
              </div>

              <!-- Edit -->
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs font-bold uppercase tracking-wider text-amber-500">Edit</span>
                <div class="flex-1 h-px bg-amber-100"></div>
              </div>
              <div class="space-y-1.5 mb-5">
                <div class="flex justify-between"><span class="text-gray-600">Undo</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Ctrl+Z</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Redo</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Ctrl+Y</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Copy</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Ctrl+C</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Paste</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Ctrl+V</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Select all</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Ctrl+A</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Deselect all</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Ctrl+D</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Save project</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Ctrl+S</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Cancel / Deselect</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Esc</kbd></div>
              </div>
            </div>

            <!-- Right column -->
            <div>
              <!-- Elements -->
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs font-bold uppercase tracking-wider text-emerald-500">Elements</span>
                <div class="flex-1 h-px bg-emerald-100"></div>
              </div>
              <div class="space-y-1.5 mb-5">
                <div class="flex justify-between"><span class="text-gray-600">Rotate element</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">R</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Delete selected</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Del</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Lock / Unlock</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Ctrl+L</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Group selection</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Ctrl+G</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Ungroup</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Ctrl+⇧+G</kbd></div>
              </div>

              <!-- View -->
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs font-bold uppercase tracking-wider text-blue-500">View</span>
                <div class="flex-1 h-px bg-blue-100"></div>
              </div>
              <div class="space-y-1.5 mb-5">
                <div class="flex justify-between"><span class="text-gray-600">Toggle 2D / 3D</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Tab</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Zoom to fit</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">F</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Toggle grid</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">G</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Toggle layers</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">L</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Show shortcuts</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">?</kbd></div>
              </div>

              <!-- Canvas -->
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs font-bold uppercase tracking-wider text-purple-500">Canvas</span>
                <div class="flex-1 h-px bg-purple-100"></div>
              </div>
              <div class="space-y-1.5 mb-5">
                <div class="flex justify-between"><span class="text-gray-600">Zoom in / out</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Scroll</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Zoom in / out</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">+ / −</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Pan canvas</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Space+Drag</kbd></div>
              </div>

              <!-- Walls -->
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs font-bold uppercase tracking-wider text-rose-500">Walls</span>
                <div class="flex-1 h-px bg-rose-100"></div>
              </div>
              <div class="space-y-1.5">
                <div class="flex justify-between"><span class="text-gray-600">Finish wall chain</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">Dbl-click</kbd></div>
                <div class="flex justify-between"><span class="text-gray-600">Close wall loop</span><kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-slate-700 border border-gray-200">C</kbd></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-3 border-t border-gray-100 text-center">
          <p class="text-xs text-gray-400">Press <kbd class="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono border border-gray-200">?</kbd> or <kbd class="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono border border-gray-200">Esc</kbd> to close</p>
        </div>
      </div>
    </div>
  {/if}

  <CommandPalette bind:open={commandPaletteOpen} />
  <PrintLayout
    bind:open={printOpen}
    layoutId={backendLayoutId ?? ''}
    siteName={printSiteName}
    layoutName={printLayoutName}
    companyNameProp={printCompanyName}
    companyLogoUrl={printCompanyLogo}
  />
  <OnboardingTooltip />

  {#if $dxfImportOpen && backendLayoutId}
    <DxfImportPanel layoutId={backendLayoutId} onClose={() => dxfImportOpen.set(false)} />
  {/if}
{:else}
  <div class="h-screen flex flex-col items-center justify-center gap-3">
    <p class="text-gray-400">Loading...</p>
  </div>
{/if}

{#if loadError}
  <div class="fixed top-16 left-1/2 -translate-x-1/2 z-[100] w-[calc(100vw-2rem)] max-w-md bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-lg px-4 py-3 flex items-start gap-3" role="alert">
    <div class="flex-1 text-sm">
      <p class="font-semibold">Không tải được layout</p>
      <p>{loadError} — kiểm tra backend đã chạy chưa (http://localhost:4000)</p>
    </div>
    <button class="text-red-400 hover:text-red-600 text-lg leading-none" onclick={() => loadError = null} aria-label="Đóng">✕</button>
  </div>
{/if}
