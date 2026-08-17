<script lang="ts">
  interface DataPoint {
    date: string;
    stages: Record<string, number>;
  }

  interface Props {
    data: DataPoint[];
    stageColors: Record<string, string>;
  }

  let { data, stageColors }: Props = $props();

  const W = 700;
  const H = 280;
  const PAD = { top: 20, right: 20, bottom: 48, left: 56 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allStages = $derived(
    [...new Set(data.flatMap((d) => Object.keys(d.stages)))]
  );

  const maxTotal = $derived(
    Math.max(...data.map((d) => Object.values(d.stages).reduce((s, v) => s + v, 0)), 1)
  );

  const yMax = $derived(Math.ceil(maxTotal / 10) * 10 || 10);

  const barSlot = $derived(data.length > 0 ? chartW / data.length : 0);
  const barW = $derived(Math.max(6, barSlot * 0.65));

  function segments(d: DataPoint, i: number) {
    const segs: { stage: string; x: number; y: number; h: number; fill: string }[] = [];
    let yOff = 0;
    for (const stage of allStages) {
      const area = d.stages[stage] ?? 0;
      if (area <= 0) continue;
      const h = (area / yMax) * chartH;
      segs.push({
        stage,
        x: PAD.left + i * barSlot + (barSlot - barW) / 2,
        y: PAD.top + chartH - yOff - h,
        h,
        fill: stageColors[stage] ?? '#94a3b8',
      });
      yOff += h;
    }
    return segs;
  }

  const yTicks = $derived(
    [0, 0.25, 0.5, 0.75, 1].map((p) => ({
      v: Math.round(p * yMax),
      y: PAD.top + chartH * (1 - p),
    }))
  );

  function xLabel(date: string) {
    return `${date.slice(8)}/${date.slice(5, 7)}`;
  }
</script>

<div class="w-full overflow-x-auto">
  <svg
    viewBox="0 0 {W} {H}"
    class="w-full"
    style="min-width: {Math.max(W, data.length * 40)}px; max-height: 280px;"
  >
    <!-- Gridlines + Y labels -->
    {#each yTicks as t}
      <line
        x1={PAD.left} y1={t.y}
        x2={PAD.left + chartW} y2={t.y}
        stroke="#e5e7eb" stroke-width="1"
      />
      <text x={PAD.left - 6} y={t.y + 4} text-anchor="end" font-size="11" fill="#9ca3af">
        {t.v}
      </text>
    {/each}

    <!-- Bars -->
    {#each data as d, i}
      {#each segments(d, i) as seg}
        <rect x={seg.x} y={seg.y} width={barW} height={seg.h} fill={seg.fill} rx="2" />
      {/each}
      <text
        x={PAD.left + i * barSlot + barSlot / 2}
        y={H - PAD.bottom + 14}
        text-anchor="middle"
        font-size="10"
        fill="#6b7280"
      >{xLabel(d.date)}</text>
    {/each}

    <!-- Axes -->
    <line
      x1={PAD.left} y1={PAD.top}
      x2={PAD.left} y2={PAD.top + chartH}
      stroke="#d1d5db" stroke-width="1"
    />
    <line
      x1={PAD.left} y1={PAD.top + chartH}
      x2={PAD.left + chartW} y2={PAD.top + chartH}
      stroke="#d1d5db" stroke-width="1"
    />

    <!-- Y axis unit label -->
    <text
      x={14}
      y={PAD.top + chartH / 2}
      text-anchor="middle"
      font-size="10"
      fill="#9ca3af"
      transform="rotate(-90, 14, {PAD.top + chartH / 2})"
    >m²</text>
  </svg>

  <!-- Legend -->
  {#if allStages.length > 0}
    <div class="flex flex-wrap gap-3 mt-2 px-1">
      {#each allStages as stage}
        <div class="flex items-center gap-1.5">
          <div
            class="w-3 h-3 rounded-sm flex-shrink-0"
            style="background: {stageColors[stage] ?? '#94a3b8'}"
          ></div>
          <span class="text-xs text-gray-600">{stage}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
