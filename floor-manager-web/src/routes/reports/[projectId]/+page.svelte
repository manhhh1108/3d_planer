<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { api, authApi, type ApiLayout, type ApiSnapshot } from '$lib/services/api';
  import StageBarChart from '$lib/components/reports/StageBarChart.svelte';
  import { createPdf, addTitleBlock, drawFloorPlan, addBlockTable } from '$lib/utils/pdfUtils';
  import autoTable from 'jspdf-autotable';

  const projectId = $page.params.projectId ?? '';

  type Tab = 'summary' | 'process' | 'occupation';
  let tab = $state<Tab>('summary');

  let projectName = $state('');
  let layouts = $state<ApiLayout[]>([]);
  let selectedLayoutId = $state('');
  let snapshots = $state<ApiSnapshot[]>([]);
  let selectedDate = $state('');
  let loading = $state(true);

  // Process chart
  let chartStartDate = $state('');
  let chartEndDate = $state('');
  let chartData = $state<{ date: string; stages: Record<string, number> }[]>([]);

  // Occupation filters
  let occStartDate = $state('');
  let occEndDate = $state('');
  let occLayoutId = $state('');
  let siteName = $state('');
  let currentUserEmail = $state('');

  // Data
  let summary = $state<Awaited<ReturnType<typeof api.reports.summary>> | null>(null);
  let byProcess = $state<Awaited<ReturnType<typeof api.reports.byProcess>>>([]);
  let occupation = $state<Awaited<ReturnType<typeof api.reports.occupation>>>([]);

  const STAGE_COLORS: Record<string, string> = {
    'Hàn': 'bg-amber-50 text-amber-700',
    'Sơn': 'bg-green-50 text-green-700',
    'Lắp ráp': 'bg-blue-50 text-blue-700',
    'Cắt': 'bg-red-50 text-red-600',
  };

  const STAGE_HEX: Record<string, string> = {
    'Hàn': '#f59e0b',
    'Sơn': '#22c55e',
    'Lắp ráp': '#3b82f6',
    'Cắt': '#ef4444',
  };

  onMount(async () => {
    try {
      const [proj, allLayouts, me] = await Promise.all([
        api.projects.get(projectId),
        api.layouts.list(),
        authApi.me(),
      ]);
      projectName = proj.name;
      layouts = allLayouts;
      currentUserEmail = me.email;
      if (layouts.length > 0) {
        selectedLayoutId = layouts[0].id;
        await onLayoutChange();
      }
      occupation = await api.reports.occupation({ projectId });
    } finally {
      loading = false;
    }
  });

  async function onLayoutChange() {
    const layout = layouts.find((l) => l.id === selectedLayoutId);
    if (layout?.siteId) {
      try {
        const site = await api.sites.get(layout.siteId);
        siteName = site.name;
      } catch {
        siteName = '';
      }
    } else {
      siteName = '';
    }
    snapshots = await api.snapshots.list(selectedLayoutId);
    if (snapshots.length > 0) {
      selectedDate = snapshots[0].date.slice(0, 10);
      await loadReports();
      chartEndDate = snapshots[0].date.slice(0, 10);
      const d = new Date(chartEndDate);
      d.setDate(d.getDate() - 29);
      chartStartDate = d.toISOString().slice(0, 10);
      await loadChart();
    } else {
      selectedDate = '';
      summary = null;
      byProcess = [];
    }
  }

  async function loadChart() {
    if (!selectedLayoutId || !chartStartDate || !chartEndDate) return;
    try {
      chartData = await api.reports.byProcessRange(selectedLayoutId, chartStartDate, chartEndDate);
    } catch {
      chartData = [];
    }
  }

  async function loadOccupation() {
    try {
      occupation = await api.reports.occupation({
        projectId,
        layoutId: occLayoutId || undefined,
        startDate: occStartDate || undefined,
        endDate: occEndDate || undefined,
      });
    } catch {
      occupation = [];
    }
  }

  async function loadReports() {
    if (!selectedLayoutId || !selectedDate) return;
    try {
      [summary, byProcess] = await Promise.all([
        api.reports.summary(selectedLayoutId, selectedDate),
        api.reports.byProcess(selectedLayoutId, selectedDate),
      ]);
    } catch {
      summary = null;
      byProcess = [];
    }
  }

  function fmt(d: string) {
    return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  }

  const layoutName = $derived(layouts.find((l) => l.id === selectedLayoutId)?.name ?? '');

  async function exportPDF() {
    const doc = await createPdf();
    const today = new Date().toLocaleDateString('vi-VN');
    const layout = layouts.find((l) => l.id === selectedLayoutId);

    if (tab === 'summary' && summary) {
      let y = addTitleBlock(doc, {
        siteName,
        layoutName,
        snapshotDate: fmt(selectedDate),
        exportedBy: currentUserEmail,
        exportDate: today,
        title: 'Tổng hợp mặt bằng',
      });

      if (layout && summary.snapshot.positions && summary.snapshot.positions.length > 0) {
        y = drawFloorPlan(
          doc,
          summary.snapshot.positions,
          layout.widthM,
          layout.heightM,
          y,
          90,
        );
      }

      addBlockTable(
        doc,
        (summary.snapshot.positions ?? []).map((p) => ({
          code: p.product?.code ?? '',
          name: p.product?.name ?? '',
          projectName,
          processStage: p.product?.processStage ?? '',
          weightKg: p.product?.weightKg ?? null,
          areaM2: p.product?.areaM2 ?? null,
        })),
        y,
      );
      doc.save(`mat-bang-${selectedDate}.pdf`);

    } else if (tab === 'process') {
      const y = addTitleBlock(doc, {
        siteName,
        layoutName,
        snapshotDate: selectedDate ? fmt(selectedDate) : '—',
        exportedBy: currentUserEmail,
        exportDate: today,
        title: 'Thống kê theo công đoạn',
      });
      addBlockTable(
        doc,
        byProcess.map((r) => ({
          code: '',
          name: r.processStage,
          projectName,
          processStage: r.processStage,
          weightKg: r.totalWeight,
          areaM2: r.totalArea,
        })),
        y,
      );
      doc.save(`cong-doan-${selectedDate}.pdf`);

    } else {
      const y = addTitleBlock(doc, {
        siteName,
        layoutName: occLayoutId ? (layouts.find((l) => l.id === occLayoutId)?.name ?? 'Tất cả') : 'Tất cả',
        snapshotDate: '',
        exportedBy: currentUserEmail,
        exportDate: today,
        title: 'Thời gian chiếm dụng mặt bằng',
      });
      autoTable(doc, {
        startY: y,
        styles: { font: 'NotoSans', fontSize: 8 },
        headStyles: { font: 'NotoSans', fillColor: [51, 65, 85] },
        footStyles: { font: 'NotoSans', fillColor: [226, 232, 240] },
        head: [['Sản phẩm', 'Mã', 'Dự án', 'Layout', 'Từ ngày', 'Đến ngày', 'Số ngày', 'Diện tích (m²)', 'm² × ngày']],
        body: occupation.map((r) => [
          r.productName, r.productCode, r.projectName, r.layoutName,
          fmt(r.startDate), fmt(r.endDate), r.days, r.areaM2, r.areaDays,
        ]),
        foot: [['', '', '', '', '', '', '', 'Tổng', occupation.reduce((s, r) => s + r.areaDays, 0).toFixed(1)]],
      });
      doc.save('chiem-dung-mat-bang.pdf');
    }
  }

  function exportCSV() {
    const headers = ['Sản phẩm', 'Mã', 'Dự án', 'Layout', 'Từ ngày', 'Đến ngày', 'Số ngày', 'Diện tích (m²)', 'm² × ngày'];
    const rows = occupation.map((r) => [
      r.productName, r.productCode, r.projectName, r.layoutName,
      fmt(r.startDate), fmt(r.endDate), r.days, r.areaM2, r.areaDays,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chiem-dung-mat-bang.csv';
    a.click();
    URL.revokeObjectURL(url);
  }


</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <div class="bg-gradient-to-r from-slate-800 to-slate-700 shadow-sm">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
      <a href={`${base}/products/${projectId}`} class="flex items-center gap-1 text-white/70 hover:text-white text-sm transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        Sản phẩm
      </a>
      <div class="h-5 w-px bg-white/20"></div>
      <h1 class="text-xl font-bold text-white flex-1">Báo cáo</h1>
      <button onclick={exportPDF} class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold text-sm">
        🖨 Xuất PDF
      </button>
    </div>
  </div>

  <div class="max-w-6xl mx-auto px-6 py-8">
    {#if loading}
      <div class="text-center py-16 text-gray-400">Đang tải...</div>
    {:else}
      <!-- Controls -->
      <div class="flex flex-wrap items-center gap-3 mb-6">
        <div class="flex bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          <button class="px-4 py-1.5 rounded-lg text-sm transition-colors {tab === 'summary' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}" onclick={() => tab = 'summary'}>Tổng hợp mặt bằng</button>
          <button class="px-4 py-1.5 rounded-lg text-sm transition-colors {tab === 'process' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}" onclick={() => tab = 'process'}>Theo công đoạn</button>
          <button class="px-4 py-1.5 rounded-lg text-sm transition-colors {tab === 'occupation' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}" onclick={() => tab = 'occupation'}>Thời gian chiếm dụng</button>
        </div>
        {#if tab !== 'occupation'}
          <select bind:value={selectedLayoutId} onchange={onLayoutChange} class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-blue-400">
            {#each layouts as l}<option value={l.id}>{l.name}</option>{/each}
          </select>
          <select bind:value={selectedDate} onchange={loadReports} class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-blue-400">
            {#each snapshots as s}<option value={s.date.slice(0, 10)}>{fmt(s.date.slice(0, 10))}</option>{/each}
          </select>
        {/if}
      </div>

      {#if tab === 'summary'}
        {#if summary}
          <!-- Stat cards -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div class="rounded-xl p-4 text-center bg-blue-50">
              <div class="text-2xl font-bold text-blue-700">{summary.snapshot.positions?.length ?? 0}</div>
              <div class="text-xs text-blue-500 font-medium mt-1">Sản phẩm trên mặt bằng</div>
            </div>
            <div class="rounded-xl p-4 text-center bg-green-50">
              <div class="text-2xl font-bold text-green-700">{summary.totalArea.toFixed(1)} m²</div>
              <div class="text-xs text-green-600 font-medium mt-1">Tổng diện tích chiếm</div>
            </div>
            <div class="rounded-xl p-4 text-center bg-amber-50">
              <div class="text-2xl font-bold text-amber-700">{summary.layoutArea.toFixed(0)} m²</div>
              <div class="text-xs text-amber-500 font-medium mt-1">Diện tích mặt bằng</div>
            </div>
            <div class="rounded-xl p-4 text-center {summary.usageRate >= 80 ? 'bg-red-50' : 'bg-purple-50'}">
              <div class="text-2xl font-bold {summary.usageRate >= 80 ? 'text-red-600' : 'text-purple-700'}">
                {summary.usageRate}%
              </div>
              <div class="text-xs {summary.usageRate >= 80 ? 'text-red-400' : 'text-purple-400'} font-medium mt-1">
                Tỷ lệ sử dụng
                {#if summary.usageRate >= 80}
                  <span class="ml-1 font-bold">⚠ Quá tải</span>
                {/if}
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div class="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800 text-sm">
              Tổng hợp mặt bằng · {layoutName} · Ngày {fmt(selectedDate)}
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th class="px-4 py-2.5">STT</th>
                  <th class="px-4 py-2.5">Sản phẩm</th>
                  <th class="px-4 py-2.5">Mã</th>
                  <th class="px-4 py-2.5">Vị trí (X, Y)</th>
                  <th class="px-4 py-2.5">Diện tích (m²)</th>
                  <th class="px-4 py-2.5">Khối lượng (T)</th>
                  <th class="px-4 py-2.5">Công đoạn</th>
                </tr>
              </thead>
              <tbody>
                {#each summary.snapshot.positions ?? [] as p, i}
                  <tr class="border-b border-gray-100 last:border-0">
                    <td class="px-4 py-2.5 text-gray-500">{i + 1}</td>
                    <td class="px-4 py-2.5 font-medium text-gray-800">{p.product?.name}</td>
                    <td class="px-4 py-2.5 text-gray-500">{p.product?.code}</td>
                    <td class="px-4 py-2.5 text-gray-500">{p.x.toFixed(1)}, {p.y.toFixed(1)}</td>
                    <td class="px-4 py-2.5 text-gray-500">{p.product?.areaM2 ?? '—'}</td>
                    <td class="px-4 py-2.5 text-gray-500">{p.product?.weightKg ? (p.product.weightKg / 1000).toFixed(1) : '—'}</td>
                    <td class="px-4 py-2.5">
                      {#if p.product?.processStage}
                        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-medium {STAGE_COLORS[p.product.processStage] ?? 'bg-gray-100 text-gray-600'}">{p.product.processStage}</span>
                      {:else}—{/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr class="bg-gray-50 font-bold text-gray-800 border-t border-gray-200">
                  <td class="px-4 py-2.5" colspan="4">Tổng cộng</td>
                  <td class="px-4 py-2.5">{summary.totalArea.toFixed(1)}</td>
                  <td class="px-4 py-2.5">{(summary.totalWeight / 1000).toFixed(1)}</td>
                  <td class="px-4 py-2.5"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        {:else}
          <div class="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
            Chưa có snapshot cho mặt bằng này — mở editor và bấm "Lưu Snapshot"
          </div>
        {/if}

      {:else if tab === 'process'}
        <!-- Date range controls cho chart -->
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <span class="text-xs text-gray-500">Xem chart từ</span>
          <input
            type="date"
            bind:value={chartStartDate}
            onchange={loadChart}
            class="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white outline-none focus:border-blue-400"
          />
          <span class="text-xs text-gray-500">đến</span>
          <input
            type="date"
            bind:value={chartEndDate}
            onchange={loadChart}
            class="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white outline-none focus:border-blue-400"
          />
        </div>

        {#if chartData.length > 0}
          <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
            <div class="text-xs font-semibold text-gray-600 mb-3">Diện tích theo công đoạn (m²/ngày)</div>
            <StageBarChart data={chartData} stageColors={STAGE_HEX} />
          </div>
        {:else if chartStartDate && chartEndDate}
          <div class="text-center py-6 bg-white rounded-xl border border-dashed border-gray-200 text-gray-400 text-sm mb-4">
            Không có snapshot nào trong khoảng ngày này
          </div>
        {/if}

        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div class="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800 text-sm">
            Thống kê theo công đoạn · {layoutName} · Ngày {selectedDate ? fmt(selectedDate) : '—'}
          </div>
          {#if byProcess.length === 0}
            <div class="text-center py-12 text-gray-400 text-sm">Không có dữ liệu</div>
          {:else}
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th class="px-4 py-2.5">Công đoạn</th>
                  <th class="px-4 py-2.5">Số sản phẩm</th>
                  <th class="px-4 py-2.5">Tổng diện tích (m²)</th>
                  <th class="px-4 py-2.5">Tổng khối lượng (T)</th>
                  <th class="px-4 py-2.5">Tỷ lệ diện tích</th>
                </tr>
              </thead>
              <tbody>
                {#each byProcess as r}
                  <tr class="border-b border-gray-100 last:border-0">
                    <td class="px-4 py-2.5">
                      <span class="px-2.5 py-0.5 rounded-full text-[11px] font-medium {STAGE_COLORS[r.processStage] ?? 'bg-gray-100 text-gray-600'}">{r.processStage}</span>
                    </td>
                    <td class="px-4 py-2.5 text-gray-500">{r.count}</td>
                    <td class="px-4 py-2.5 text-gray-500">{r.totalArea.toFixed(1)}</td>
                    <td class="px-4 py-2.5 text-gray-500">{(r.totalWeight / 1000).toFixed(1)}</td>
                    <td class="px-4 py-2.5">
                      <div class="flex items-center gap-2">
                        <div class="flex-1 max-w-[120px] h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div class="h-full bg-blue-500 rounded-full" style="width: {r.areaPercent}%"></div>
                        </div>
                        <span class="text-gray-600 text-xs font-medium">{r.areaPercent}%</span>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>

      {:else}
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <select
            bind:value={occLayoutId}
            onchange={loadOccupation}
            class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-blue-400"
          >
            <option value="">Tất cả layout</option>
            {#each layouts as l}<option value={l.id}>{l.name}</option>{/each}
          </select>
          <input
            type="date"
            bind:value={occStartDate}
            onchange={loadOccupation}
            class="px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-blue-400"
          />
          <span class="text-xs text-gray-400">—</span>
          <input
            type="date"
            bind:value={occEndDate}
            onchange={loadOccupation}
            class="px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-blue-400"
          />
          <button
            onclick={exportCSV}
            disabled={occupation.length === 0}
            class="ml-auto px-3 py-1.5 bg-green-500 text-white text-xs font-medium rounded-lg hover:bg-green-600 disabled:opacity-40"
          >
            ⬇ Xuất CSV
          </button>
        </div>

        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div class="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800 text-sm">
            Thời gian chiếm dụng mặt bằng (toàn dự án)
          </div>
          {#if occupation.length === 0}
            <div class="text-center py-12 text-gray-400 text-sm">Không có dữ liệu — cần ít nhất 1 snapshot</div>
          {:else}
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th class="px-4 py-2.5">Sản phẩm</th>
                  <th class="px-4 py-2.5">Mã</th>
                  <th class="px-4 py-2.5">Dự án</th>
                  <th class="px-4 py-2.5">Layout</th>
                  <th class="px-4 py-2.5">Từ ngày</th>
                  <th class="px-4 py-2.5">Đến ngày</th>
                  <th class="px-4 py-2.5">Số ngày</th>
                  <th class="px-4 py-2.5">Diện tích (m²)</th>
                  <th class="px-4 py-2.5">m² × ngày</th>
                </tr>
              </thead>
              <tbody>
                {#each occupation as r}
                  <tr class="border-b border-gray-100 last:border-0">
                    <td class="px-4 py-2.5 font-medium text-gray-800">{r.productName}</td>
                    <td class="px-4 py-2.5 text-gray-500">{r.productCode}</td>
                    <td class="px-4 py-2.5 text-gray-500">{r.projectName}</td>
                    <td class="px-4 py-2.5 text-gray-500">{r.layoutName}</td>
                    <td class="px-4 py-2.5 text-gray-500">{fmt(r.startDate)}</td>
                    <td class="px-4 py-2.5 text-gray-500">{fmt(r.endDate)}</td>
                    <td class="px-4 py-2.5 text-gray-500">{r.days}</td>
                    <td class="px-4 py-2.5 text-gray-500">{r.areaM2}</td>
                    <td class="px-4 py-2.5 font-medium text-gray-800">{r.areaDays}</td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr class="bg-gray-50 font-bold text-gray-800 border-t border-gray-200">
                  <td class="px-4 py-2.5" colspan="8">Tổng m² × ngày</td>
                  <td class="px-4 py-2.5">{occupation.reduce((s, r) => s + r.areaDays, 0).toFixed(1)}</td>
                </tr>
              </tfoot>
            </table>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>
