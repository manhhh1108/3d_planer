<script lang="ts">
  import { api, type ApiPlan } from '$lib/services/api';
  import { canEdit } from '$lib/stores/auth';

  let { plans = [], selectedPlanId = null, layoutId = '', onSelectPlan = (_id: string) => {}, onPlansChanged = () => {} }: {
    plans: ApiPlan[];
    selectedPlanId: string | null;
    layoutId: string;
    onSelectPlan: (id: string) => void;
    onPlansChanged: () => void;
  } = $props();

  let showCreate = $state(false);
  let newName = $state('');
  let confirmDeleteId = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);

  async function createPlan() {
    if (!newName.trim() || !layoutId) return;
    errorMsg = null;
    try {
      const plan = await api.plans.create({ layoutId, name: newName.trim() });
      newName = '';
      showCreate = false;
      await onPlansChanged();
      onSelectPlan(plan.id);
    } catch (err) {
      console.error('createPlan failed', err);
      errorMsg = 'Tạo plan thất bại. Vui lòng thử lại.';
    }
  }

  async function deletePlan(id: string) {
    errorMsg = null;
    try {
      await api.plans.remove(id);
      confirmDeleteId = null;
      await onPlansChanged();
      // Nếu xoá plan đang chọn, chọn plan đầu tiên còn lại
      if (selectedPlanId === id) {
        const remaining = plans.filter(p => p.id !== id);
        onSelectPlan(remaining.length > 0 ? remaining[0].id : '');
      }
    } catch (err) {
      console.error('deletePlan failed', err);
      confirmDeleteId = null;
      errorMsg = 'Xoá plan thất bại. Vui lòng thử lại.';
    }
  }
</script>

<div class="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50">
  <span class="text-xs font-semibold text-gray-500 uppercase">Plan:</span>

  {#if plans.length > 0}
    <select
      class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-blue-400"
      value={selectedPlanId}
      onchange={(e) => onSelectPlan((e.target as HTMLSelectElement).value)}
    >
      {#each plans as plan}
        <option value={plan.id}>{plan.name} ({plan._count?.items ?? 0} items)</option>
      {/each}
    </select>
  {:else}
    <span class="text-sm text-gray-400">Chưa có plan</span>
  {/if}

  {#if $canEdit}
    {#if showCreate}
      <input
        type="text"
        bind:value={newName}
        placeholder="Tên plan..."
        class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 w-40"
        onkeydown={(e) => { if (e.key === 'Enter') createPlan(); if (e.key === 'Escape') showCreate = false; }}
      />
      <button onclick={createPlan} disabled={!newName.trim()} class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 disabled:opacity-40">Tạo</button>
      <button onclick={() => showCreate = false} class="px-2 py-1.5 text-xs text-gray-500">Huỷ</button>
    {:else}
      <button onclick={() => showCreate = true} class="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100">+ Tạo plan</button>
    {/if}

    {#if selectedPlanId}
      {#if confirmDeleteId === selectedPlanId}
        <div class="flex items-center gap-1 ml-auto">
          <span class="text-xs text-red-500">Xoá plan?</span>
          <button onclick={() => deletePlan(selectedPlanId!)} class="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">Có</button>
          <button onclick={() => confirmDeleteId = null} class="px-2 py-1 bg-gray-200 text-xs rounded">Không</button>
        </div>
      {:else}
        <button onclick={() => confirmDeleteId = selectedPlanId} class="ml-auto px-3 py-1.5 text-xs text-red-500 bg-red-50 rounded-lg hover:bg-red-100">Xoá plan</button>
      {/if}
    {/if}
  {/if}

  {#if errorMsg}
    <span class="text-xs text-red-500">{errorMsg}</span>
  {/if}
</div>
