<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type ApiStage, type OutsideZonePolicy } from '$lib/services/api';
  import { isAdmin } from '$lib/stores/auth';

  let stages = $state<ApiStage[]>([]);
  let policy = $state<OutsideZonePolicy>('warn');
  let marginCm = $state<number>(50);
  let newName = $state('');
  let newColor = $state('#3b82f6');
  let err = $state('');
  let loading = $state(true);

  async function load() {
    loading = true; err = '';
    try {
      const [st, p, m] = await Promise.all([
        api.stages.list(true),
        api.settings.get<OutsideZonePolicy>('outsideZonePolicy'),
        api.settings.get<number>('defaultMarginCm'),
      ]);
      stages = st;
      policy = (p.value ?? 'warn') as OutsideZonePolicy;
      const mv = Number(m.value);
      marginCm = Number.isFinite(mv) ? mv : 50;
    } catch { err = 'Không tải được dữ liệu'; }
    finally { loading = false; }
  }
  onMount(load);

  async function addStage(e: SubmitEvent) {
    e.preventDefault(); err = '';
    if (!newName.trim()) return;
    try { await api.stages.create({ name: newName.trim(), color: newColor, order: stages.length }); newName = ''; await load(); }
    catch { err = 'Không tạo được công đoạn'; }
  }
  async function patch(s: ApiStage, d: Partial<ApiStage>) {
    try { await api.stages.update(s.id, d); await load(); } catch { err = 'Không cập nhật được'; }
  }
  async function softDelete(s: ApiStage) {
    if (!confirm(`Ẩn công đoạn "${s.name}"?`)) return;
    try { await api.stages.remove(s.id); await load(); } catch { err = 'Không ẩn được'; }
  }
  async function savePolicy() { try { await api.settings.put('outsideZonePolicy', policy); } catch { err = 'Không lưu được cài đặt'; } }
  async function saveMargin() { try { await api.settings.put('defaultMarginCm', Number(marginCm)); } catch { err = 'Không lưu được margin'; } }
</script>

{#if !$isAdmin}
  <p class="text-sm text-gray-500 p-4">Chỉ ADMIN mới quản lý công đoạn.</p>
{:else}
<div class="space-y-6">
  {#if err}<div class="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{err}</div>{/if}

  <section>
    <h3 class="text-sm font-semibold text-gray-800 mb-2">Công đoạn sản xuất</h3>
    {#if loading}
      <p class="text-sm text-gray-400">Đang tải…</p>
    {:else}
    <div class="space-y-1.5">
      {#each stages as s (s.id)}
        <div class="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5 {s.active ? '' : 'opacity-50'}">
          <input type="color" value={s.color} onchange={(e) => patch(s, { color: (e.currentTarget as HTMLInputElement).value })} class="h-7 w-9 rounded cursor-pointer border-0 bg-transparent p-0" aria-label="Màu" />
          <input value={s.name} onchange={(e) => patch(s, { name: (e.currentTarget as HTMLInputElement).value })} class="flex-1 px-2 py-1 text-sm rounded border border-gray-200" />
          <input type="number" value={s.order} onchange={(e) => patch(s, { order: Number((e.currentTarget as HTMLInputElement).value) })} class="w-14 px-1.5 py-1 text-sm rounded border border-gray-200" title="Thứ tự" />
          {#if s.active}
            <button onclick={() => softDelete(s)} class="text-xs text-gray-500 hover:text-red-600 px-2 py-1">Ẩn</button>
          {:else}
            <button onclick={() => patch(s, { active: true })} class="text-xs text-blue-600 hover:text-blue-700 px-2 py-1">Khôi phục</button>
          {/if}
        </div>
      {/each}
    </div>
    <form onsubmit={addStage} class="mt-3 flex items-center gap-2">
      <input placeholder="Tên công đoạn mới" bind:value={newName} class="flex-1 px-2 py-1.5 text-sm rounded border border-gray-200" />
      <input type="color" bind:value={newColor} class="h-8 w-10 rounded cursor-pointer border-0 bg-transparent p-0" aria-label="Màu mới" />
      <button type="submit" class="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500">Thêm</button>
    </form>
    {/if}
  </section>

  <section>
    <h3 class="text-sm font-semibold text-gray-800 mb-2">Khi đặt sản phẩm ngoài mọi vùng</h3>
    <select bind:value={policy} onchange={savePolicy} class="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
      <option value="warn">Cho đặt + cảnh báo (mặc định)</option>
      <option value="block">Chặn hoàn toàn</option>
      <option value="silent">Cho đặt, không cảnh báo</option>
    </select>
  </section>

  <section>
    <h3 class="text-sm font-semibold text-gray-800 mb-2">Khoảng cách mặc định (margin)</h3>
    <label class="flex items-center gap-2 text-sm text-gray-600">
      Margin quanh sản phẩm (cm):
      <input type="number" min="0" bind:value={marginCm} onchange={saveMargin} class="w-24 px-2 py-1.5 text-sm rounded-lg border border-gray-200" />
    </label>
  </section>
</div>
{/if}
