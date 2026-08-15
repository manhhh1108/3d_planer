<script lang="ts">
  import { api, type ApiConflict } from '$lib/services/api';

  let { conflicts = [], suggestions = [], planId = null, onApplySuggestion = () => {} }: {
    conflicts: ApiConflict[];
    suggestions: { itemId: string; suggestedStart: string; reason: string }[];
    planId: string | null;
    onApplySuggestion: () => void;
  } = $props();

  let applying = $state<string | null>(null);

  async function applySuggestion(s: { itemId: string; suggestedStart: string }) {
    applying = s.itemId;
    try {
      await api.plans.updateItem(s.itemId, { startDate: s.suggestedStart });
      onApplySuggestion();
    } finally {
      applying = null;
    }
  }
</script>

{#if conflicts.length > 0}
  <div class="border-t border-red-200 bg-red-50/50 max-h-40 overflow-auto">
    <div class="px-4 py-2 flex items-center gap-2">
      <span class="text-xs font-semibold text-red-600 uppercase">{conflicts.length} xung đột</span>
    </div>
    <div class="divide-y divide-red-100">
      {#each conflicts as c}
        <div class="px-4 py-2 text-xs">
          <p class="text-red-700">
            <span class="font-semibold">{c.itemA.productName}</span> ({c.itemA.startDate} → {c.itemA.endDate})
            và
            <span class="font-semibold">{c.itemB.productName}</span> ({c.itemB.startDate} → {c.itemB.endDate})
          </p>
          <p class="text-red-500">Chồng nhau: {c.overlapStart} → {c.overlapEnd}</p>
          {#each suggestions.filter(s => s.itemId === c.itemA.id || s.itemId === c.itemB.id) as s}
            <button
              class="mt-1 px-2 py-1 bg-blue-50 text-blue-600 rounded text-[11px] font-medium hover:bg-blue-100 disabled:opacity-40"
              onclick={() => applySuggestion(s)}
              disabled={applying === s.itemId}
            >
              {applying === s.itemId ? '...' : `Dịch sang ${s.suggestedStart}`}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}
