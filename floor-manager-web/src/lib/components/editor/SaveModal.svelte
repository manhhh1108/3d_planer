<script lang="ts">
  import { todayStr } from '$lib/services/mapping';

  interface Props {
    onConfirm: (date: string) => void;
    onCancel: () => void;
  }
  const { onConfirm, onCancel }: Props = $props();

  const today = todayStr();
  let selectedDate = $state(today);
</script>

<div
  class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
  role="dialog"
  aria-modal="true"
  aria-label="Lưu snapshot"
>
  <div class="bg-white rounded-xl shadow-xl p-6 w-80">
    <h3 class="text-base font-semibold text-gray-900 mb-4">Lưu Snapshot</h3>

    <label class="block text-sm font-medium text-gray-700 mb-1" for="snapshot-date">
      Chọn ngày
    </label>
    <input
      id="snapshot-date"
      type="date"
      min={today}
      bind:value={selectedDate}
      class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />

    <div class="flex gap-2 mt-5 justify-end">
      <button
        onclick={onCancel}
        class="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
      >
        Hủy
      </button>
      <button
        onclick={() => onConfirm(selectedDate)}
        class="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium"
      >
        Lưu
      </button>
    </div>
  </div>
</div>
