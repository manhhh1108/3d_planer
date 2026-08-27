<script lang="ts">
  import { currentProject } from '$lib/stores/project';
  import { get } from 'svelte/store';
  import { getCatalogItem } from '$lib/utils/furnitureCatalog';
  import { floorPlanBounds, planHasContent } from '$lib/utils/planRender';
  import { drawWallsToCanvas } from '$lib/utils/planRender';
  import type { Project, Floor } from '$lib/models/types';
  import { api, type ApiSnapshot } from '$lib/services/api';
  import { positionToItem, todayStr } from '$lib/services/mapping';

  let {
    open = $bindable(false),
    layoutId = '',
    siteName = '',
    layoutName = '',
  }: {
    open?: boolean;
    layoutId?: string;
    siteName?: string;
    layoutName?: string;
  } = $props();

  let pageSize = $state<'a4' | 'letter'>('a4');
  let orientation = $state<'landscape' | 'portrait'>('landscape');
  let scale = $state('1:50');
  let showLegend = $state(true);
  let printCanvas: HTMLCanvasElement;
  let exporting = $state(false);
  let companyName = $state('VHE');
  let companyLogoText = $state('VHE1');
  let snapshots = $state<ApiSnapshot[]>([]);
  let selectedDates = $state<string[]>([]);
  let loadingSnapshots = $state(false);

  const SCALE_OPTIONS = ['1:25', '1:50', '1:100', '1:200'];
  const FONT = "'Noto Sans', Arial, 'Segoe UI', system-ui, sans-serif";
  const TITLE_H = 68;
  const FOOTER_H = 64;
  const PAD = 36;

  function getActiveFloor(project: Project): Floor | undefined {
    return project.floors.find(f => f.id === project.activeFloorId) ?? project.floors[0];
  }

  function getProjectName(): string {
    return get(currentProject)?.name ?? 'Mặt bằng';
  }

  function isoDate(d: string): string {
    return d.slice(0, 10);
  }

  function todayViVN(date = todayStr()): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function shortDate(date: string): string {
    return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  }

  function toggleDate(date: string) {
    selectedDates = selectedDates.includes(date)
      ? selectedDates.filter((d) => d !== date)
      : [...selectedDates, date].sort();
  }

  async function refreshSnapshots() {
    if (!layoutId) {
      snapshots = [];
      selectedDates = [];
      return;
    }
    loadingSnapshots = true;
    try {
      snapshots = await api.snapshots.list(layoutId);
      if (selectedDates.length === 0) {
        selectedDates = snapshots.some((s) => isoDate(s.date) === todayStr()) ? [todayStr()] : [];
      }
    } catch (e) {
      console.error('[PrintLayout] Không tải được danh sách snapshot:', e);
      snapshots = [];
    } finally {
      loadingSnapshots = false;
    }
  }

  function withSnapshotPositions(project: Project, snapshot: ApiSnapshot): Project {
    const clone = structuredClone(project) as Project;
    const floor = getActiveFloor(clone);
    if (floor) floor.furniture = (snapshot.positions ?? []).map(positionToItem);
    return clone;
  }

  /** Core rendering — works for screen preview (dpr>1) and PDF export (dpr=1). */
  function renderToCanvas(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    dpr = 1,
    renderProject: Project | null = get(currentProject),
    snapshotDate = todayStr(),
    pageIndex = 1,
    pageTotal = 1,
  ) {
    const project = renderProject;
    if (!project) return;
    const floor = getActiveFloor(project);
    const resolvedSiteName = siteName || 'Mặt bằng';
    const resolvedLayoutName = layoutName || floor?.name || project.name;
    const resolvedCompany = companyName.trim() || 'Công ty';
    const resolvedLogo = companyLogoText.trim() || resolvedCompany.slice(0, 4).toUpperCase();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);

    // ── Title block ──────────────────────────────────────────────
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(project.name, PAD, 13);

    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(`${resolvedSiteName} · ${resolvedLayoutName}`, PAD, 35);

    ctx.textAlign = 'right';
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`Tỉ lệ: ${scale}`, cw - PAD, 13);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(`Ngày snapshot: ${todayViVN(snapshotDate)}`, cw - PAD, 32);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD, TITLE_H - 4);
    ctx.lineTo(cw - PAD, TITLE_H - 4);
    ctx.stroke();

    // ── Legend column (right side) ───────────────────────────────
    const legendW = showLegend ? 160 : 0;
    const planAreaX = PAD;
    const planAreaY = TITLE_H + 4;
    const planAreaW = cw - PAD * 2 - legendW - (legendW > 0 ? 12 : 0);
    const planAreaH = ch - TITLE_H - FOOTER_H - 8;

    if (showLegend && floor?.furniture?.length) {
      const lx = planAreaX + planAreaW + 12;
      const ly = planAreaY + 4;
      ctx.font = `bold 9px ${FONT}`;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('DANH SÁCH BLOCK', lx, ly);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(lx, ly + 13);
      ctx.lineTo(lx + legendW - 4, ly + 13);
      ctx.stroke();

      // Group by catalogId
      const counts = new Map<string, number>();
      for (const fi of floor.furniture) {
        counts.set(fi.catalogId, (counts.get(fi.catalogId) ?? 0) + 1);
      }

      let rowY = ly + 18;
      const rowH = 18;
      for (const [cid, cnt] of counts) {
        const cat = getCatalogItem(cid);
        if (!cat) continue;
        if (rowY + rowH > ch - FOOTER_H - 14) break;

        // Color dot
        ctx.fillStyle = cat.color ?? '#3b82f6';
        ctx.beginPath();
        ctx.arc(lx + 5, rowY + 5, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e293b';
        ctx.font = `8px ${FONT}`;
        ctx.textBaseline = 'top';

        // Truncate long names
        let name = cat.name;
        if (name.length > 16) name = name.slice(0, 15) + '…';
        ctx.fillText(name, lx + 14, rowY + 1);

        ctx.fillStyle = '#64748b';
        ctx.font = `7.5px ${FONT}`;
        ctx.fillText(`SL: ${cnt}  |  ${cat.width ?? 0}×${cat.depth ?? 0}cm`, lx + 14, rowY + 11);

        rowY += rowH;
      }
    }

    // ── Floor plan ───────────────────────────────────────────────
    const planBounds = planHasContent(floor) ? floorPlanBounds(floor) : null;
    if (!floor || !planBounds) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Chưa có gì trên mặt bằng', planAreaX + planAreaW / 2, planAreaY + planAreaH / 2);
    } else {
      const { minX, minY, maxX, maxY } = planBounds;
      const planW = maxX - minX;
      const planH = maxY - minY;

      if (planW > 0 && planH > 0) {
        const fitScale = Math.min(planAreaW / planW, planAreaH / planH) * 0.92;
        const drawnW = planW * fitScale;
        const drawnH = planH * fitScale;
        const offsetX = planAreaX + (planAreaW - drawnW) / 2 - minX * fitScale;
        const offsetY = planAreaY + (planAreaH - drawnH) / 2 - minY * fitScale;

        // Clip to plan area
        ctx.save();
        ctx.beginPath();
        ctx.rect(planAreaX, planAreaY, planAreaW, planAreaH);
        ctx.clip();

        // Grid
        ctx.strokeStyle = 'rgba(148,163,184,0.18)';
        ctx.lineWidth = 0.6;
        const gridCm = 500;
        for (let x = Math.floor(minX / gridCm) * gridCm; x <= maxX + gridCm; x += gridCm) {
          const px = offsetX + x * fitScale;
          ctx.beginPath(); ctx.moveTo(px, planAreaY); ctx.lineTo(px, planAreaY + planAreaH); ctx.stroke();
        }
        for (let y = Math.floor(minY / gridCm) * gridCm; y <= maxY + gridCm; y += gridCm) {
          const py = offsetY + y * fitScale;
          ctx.beginPath(); ctx.moveTo(planAreaX, py); ctx.lineTo(planAreaX + planAreaW, py); ctx.stroke();
        }

        ctx.translate(offsetX, offsetY);
        ctx.scale(fitScale, fitScale);

        // Tường vẽ trước để block nằm đè lên, giống thứ tự trên màn hình
        drawWallsToCanvas(ctx, floor.walls, { x: 0, y: 0 }, 1.2 / fitScale);

        for (const fi of floor.furniture) {
          const cat = getCatalogItem(fi.catalogId);
          const fw = fi.width ?? cat?.width ?? 30;
          const fd = fi.depth ?? cat?.depth ?? 30;
          const color = fi.color ?? cat?.color ?? '#3b82f6';
          const rot = (fi.rotation || 0) * Math.PI / 180;

          ctx.save();
          ctx.translate(fi.position.x, fi.position.y);
          ctx.rotate(rot);

          // Fill
          ctx.fillStyle = color + 'bb';
          ctx.fillRect(-fw / 2, -fd / 2, fw, fd);

          // Border
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2 / fitScale;
          ctx.strokeRect(-fw / 2, -fd / 2, fw, fd);

          // Label
          if (cat) {
            const maxFontPx = Math.min(fw, fd) * 0.28;
            const fontSize = Math.max(5 / fitScale, Math.min(10 / fitScale, maxFontPx));
            ctx.fillStyle = '#1e293b';
            ctx.font = `bold ${fontSize}px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const maxW = fw * 0.88;
            ctx.fillText(cat.name, 0, fd > fw * 1.5 ? -fontSize * 0.6 : 0, maxW);
            if (fd > fw * 1.2) {
              ctx.font = `${fontSize * 0.75}px ${FONT}`;
              ctx.fillStyle = '#475569';
              ctx.fillText(cat.id.slice(-6).toUpperCase(), 0, fontSize * 0.9, maxW);
            }
          }
          ctx.restore();
        }

        ctx.restore(); // undo clip + translate/scale

        // Scale bar (bottom-left of plan area)
        const barM = 5;
        const barPx = barM * 100 * fitScale;
        const bx = planAreaX + 4;
        const by = planAreaY + planAreaH - 10;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx, by - 3, barPx / 2, 3);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(bx + barPx / 2, by - 3, barPx / 2, 3);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(bx, by - 3); ctx.lineTo(bx, by + 1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + barPx, by - 3); ctx.lineTo(bx + barPx, by + 1); ctx.stroke();
        ctx.fillStyle = '#475569';
        ctx.font = `8px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('0', bx, by - 5);
        ctx.textAlign = 'right';
        ctx.fillText(`${barM}m`, bx + barPx, by - 5);

        // North arrow (bottom-right of plan area)
        const ax = planAreaX + planAreaW - 16;
        const ay = planAreaY + planAreaH - 14;
        const aw = 8;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(ax, ay - aw); ctx.lineTo(ax + aw * 0.55, ay); ctx.lineTo(ax, ay - aw * 0.35); ctx.lineTo(ax - aw * 0.55, ay);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(ax, ay - aw * 0.35); ctx.lineTo(ax + aw * 0.55, ay); ctx.lineTo(ax, ay + aw); ctx.lineTo(ax - aw * 0.55, ay);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold 8px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('N', ax, ay - aw - 1);
      }
    }

    // ── Footer ───────────────────────────────────────────────────
    const footerY = ch - FOOTER_H + 6;
    const footerX = PAD;
    const footerW = cw - PAD * 2;
    const col1W = footerW * 0.44;
    const col2W = footerW * 0.25;
    const col3W = footerW - col1W - col2W;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.strokeRect(footerX, footerY, footerW, FOOTER_H - 12);
    ctx.beginPath();
    ctx.moveTo(footerX + col1W, footerY);
    ctx.lineTo(footerX + col1W, footerY + FOOTER_H - 12);
    ctx.moveTo(footerX + col1W + col2W, footerY);
    ctx.lineTo(footerX + col1W + col2W, footerY + FOOTER_H - 12);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillText(resolvedSiteName, footerX + 10, footerY + 10, col1W - 20);
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = '#ef4444';
    ctx.fillText(resolvedLayoutName, footerX + 10, footerY + 28, col1W - 20);

    ctx.fillStyle = '#0f172a';
    ctx.font = `9px ${FONT}`;
    ctx.fillText(`Ngày: ${shortDate(snapshotDate)}`, footerX + col1W + 10, footerY + 10, col2W - 20);
    ctx.fillText(`Đơn vị: ${scale}`, footerX + col1W + 10, footerY + 26, col2W - 20);

    const logoX = footerX + col1W + col2W + 12;
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillText(resolvedLogo, logoX, footerY + 10, col3W - 24);
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = '#ef4444';
    ctx.fillText(resolvedCompany, logoX, footerY + 28, col3W - 24);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.font = `8px ${FONT}`;
    ctx.fillText(`Trang ${pageIndex} / ${pageTotal}`, cw - PAD - 8, footerY + FOOTER_H - 24);
  }

  function renderPrintCanvas() {
    if (!printCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = printCanvas.clientWidth;
    const ch = printCanvas.clientHeight;
    printCanvas.width = cw * dpr;
    printCanvas.height = ch * dpr;
    renderToCanvas(printCanvas.getContext('2d')!, cw, ch, dpr);
  }

  async function exportPDF() {
    exporting = true;
    try {
      await document.fonts.ready;
      const project = get(currentProject);
      if (!project) return;

      const isLandscape = orientation === 'landscape';
      const isA4 = pageSize === 'a4';

      // 150 dpi resolution
      const W = isA4 ? (isLandscape ? 1754 : 1240) : (isLandscape ? 1650 : 1275);
      const H = isA4 ? (isLandscape ? 1240 : 1754) : (isLandscape ? 1275 : 1650);

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: isA4 ? 'a4' : 'letter',
      });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();

      const dates = selectedDates.length > 0 ? selectedDates : [todayStr()];
      const pages: { date: string; project: Project }[] = [];
      for (const date of dates) {
        const snap = snapshots.find((s) => isoDate(s.date) === date);
        if (layoutId && snap) {
          const detail = await api.snapshots.get(snap.id);
          pages.push({ date, project: withSnapshotPositions(project, detail) });
        } else {
          pages.push({ date, project });
        }
      }

      pages.forEach((page, index) => {
        if (index > 0) pdf.addPage(isA4 ? 'a4' : 'letter', isLandscape ? 'landscape' : 'portrait');
        const off = document.createElement('canvas');
        off.width = W;
        off.height = H;
        renderToCanvas(off.getContext('2d')!, W, H, 1, page.project, page.date, index + 1, pages.length);
        const imgData = off.toDataURL('image/jpeg', 0.93);
        pdf.addImage(imgData, 'JPEG', 0, 0, pw, ph);
      });
      pdf.save(`${getProjectName()}-matbang.pdf`);
    } finally {
      exporting = false;
    }
  }

  function doPrint() { window.print(); }
  function close() { open = false; }

  $effect(() => {
    if (open) {
      void refreshSnapshots();
      setTimeout(renderPrintCanvas, 60);
    }
  });
  $effect(() => {
    if (open) { void pageSize; void orientation; void scale; void showLegend; void companyName; void companyLogoText; setTimeout(renderPrintCanvas, 20); }
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center overflow-auto print-overlay-backdrop"
    onclick={close}
    onkeydown={(e) => { if (e.key === 'Escape') close(); }}
  >
    <!-- Toolbar (hidden on print) -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed top-0 left-0 right-0 bg-slate-800 text-white px-5 py-2.5 flex items-center gap-3 z-[101] print-hide"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <span class="font-semibold text-sm text-white/90">Xuất mặt bằng</span>
      <div class="h-4 w-px bg-white/20"></div>

      <label class="text-xs text-white/70 flex items-center gap-1.5">
        Khổ
        <select bind:value={pageSize} class="bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600">
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
        </select>
      </label>

      <label class="text-xs text-white/70 flex items-center gap-1.5">
        Chiều
        <select bind:value={orientation} class="bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600">
          <option value="landscape">Ngang</option>
          <option value="portrait">Dọc</option>
        </select>
      </label>

      <label class="text-xs text-white/70 flex items-center gap-1.5">
        Tỉ lệ
        <select bind:value={scale} class="bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600">
          {#each SCALE_OPTIONS as s}<option value={s}>{s}</option>{/each}
        </select>
      </label>

      <label class="text-xs text-white/70 flex items-center gap-1.5 cursor-pointer select-none">
        <input type="checkbox" bind:checked={showLegend} class="accent-blue-400" />
        Danh sách block
      </label>

      <label class="text-xs text-white/70 flex items-center gap-1.5">
        Công ty
        <input bind:value={companyName} class="w-28 bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600" />
      </label>

      <label class="text-xs text-white/70 flex items-center gap-1.5">
        Logo
        <input bind:value={companyLogoText} class="w-20 bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600" />
      </label>

      {#if layoutId}
        <div class="flex items-center gap-1.5 max-w-[22rem] overflow-x-auto">
          <span class="text-xs text-white/70 shrink-0">Ngày</span>
          {#if loadingSnapshots}
            <span class="text-xs text-white/40">Đang tải...</span>
          {:else if snapshots.length === 0}
            <span class="text-xs text-white/40">Chưa có snapshot</span>
          {:else}
            {#each [...snapshots].reverse() as s}
              {@const d = isoDate(s.date)}
              <label class="text-xs text-white/75 flex items-center gap-1 bg-white/10 rounded px-2 py-1 whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDates.includes(d)}
                  onchange={() => toggleDate(d)}
                  class="accent-blue-400"
                />
                {shortDate(d)}
              </label>
            {/each}
          {/if}
        </div>
      {/if}

      <div class="flex-1"></div>

      <button
        onclick={exportPDF}
        disabled={exporting}
        class="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
      >
        {#if exporting}
          <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          Đang xuất...
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Xuất PDF
        {/if}
      </button>

      <button
        onclick={doPrint}
        class="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 0 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        In
      </button>

      <button onclick={close} class="px-2.5 py-1.5 text-white/60 hover:text-white text-sm transition-colors">✕</button>
    </div>

    <!-- Preview page -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-white shadow-2xl mt-14 mb-8 print-page relative"
      class:print-landscape={orientation === 'landscape'}
      class:print-portrait={orientation === 'portrait'}
      class:print-a4={pageSize === 'a4'}
      class:print-letter={pageSize === 'letter'}
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <canvas bind:this={printCanvas} class="w-full h-full block"></canvas>
    </div>
  </div>
{/if}

<style>
  .print-page {
    box-sizing: border-box;
    overflow: hidden;
  }
  .print-landscape.print-a4    { width: 297mm; height: 210mm; }
  .print-portrait.print-a4     { width: 210mm; height: 297mm; }
  .print-landscape.print-letter { width: 11in; height: 8.5in; }
  .print-portrait.print-letter  { width: 8.5in; height: 11in; }

  @media print {
    .print-overlay-backdrop {
      position: fixed;
      inset: 0;
      background: white;
      display: block;
      overflow: visible;
    }
    .print-hide { display: none !important; }
    .print-page {
      position: fixed;
      top: 0; left: 0;
      margin: 0;
      box-shadow: none;
      page-break-after: always;
    }
  }
</style>
