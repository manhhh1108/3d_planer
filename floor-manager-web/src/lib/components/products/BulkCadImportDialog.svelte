<script lang="ts">
  import { api } from '$lib/services/api';
  import { runWithLimit } from '$lib/utils/concurrency';
  import CadUploadHints from './CadUploadHints.svelte';

  /** Gửi mấy file một lúc. Nhiều hơn nữa chỉ làm nghẽn, convert vẫn chạy 2 job. */
  const PARALLEL_UPLOADS = 3;
  const ACCEPT = '.dwg,.dxf,.step,.stp,.ifc';

  type RowState = 'waiting' | 'uploading' | 'created' | 'skipped' | 'error';
  type Row = { file: File; state: RowState; note: string };

  let { projectId, onclose }: { projectId: string; onclose: (imported: boolean) => void } = $props();

  let rows = $state<Row[]>([]);
  let running = $state(false);
  let finished = $state(false);

  let createdCount = $derived(rows.filter((r) => r.state === 'created').length);
  let skippedCount = $derived(rows.filter((r) => r.state === 'skipped').length);
  let errorCount = $derived(rows.filter((r) => r.state === 'error').length);

  const LABEL: Record<RowState, string> = {
    waiting: 'Chờ',
    uploading: 'Đang tải…',
    created: 'Đã tạo',
    skipped: 'Bỏ qua, mã đã có',
    error: 'Lỗi',
  };
  const TONE: Record<RowState, string> = {
    waiting: 'text-gray-400',
    uploading: 'text-blue-600',
    created: 'text-green-600',
    skipped: 'text-amber-600',
    error: 'text-red-600',
  };

  function onPick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    rows = Array.from(input.files ?? []).map((file) => ({ file, state: 'waiting', note: '' }));
    finished = false;
    input.value = '';
  }

  async function start() {
    if (rows.length === 0 || running) return;
    running = true;
    finished = false;

    const tasks = rows.map((row, i) => async () => {
      rows[i] = { ...rows[i], state: 'uploading', note: '' };
      const res = await api.products.importCad(projectId, row.file);
      rows[i] = {
        ...rows[i],
        state: res.action === 'created' ? 'created' : 'skipped',
        note: res.code,
      };
      return res;
    });

    await runWithLimit(tasks, PARALLEL_UPLOADS, (i, result) => {
      if (!result.ok) {
        rows[i] = {
          ...rows[i],
          state: 'error',
          note: result.error instanceof Error ? result.error.message : String(result.error),
        };
      }
    });

    running = false;
    finished = true;
  }

  function requestClose() {
    // Đang gửi dở: file đã gửi vẫn convert tiếp ở máy chủ, nhưng file chưa gửi
    // thì dừng hẳn — phải nói rõ trước khi đóng.
    if (running && !confirm('Đang nhập dở. Đóng lại sẽ bỏ những file chưa gửi. Vẫn đóng?')) return;
    onclose(createdCount > 0);
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  onclick={requestClose}
  onkeydown={(e) => { if (e.key === 'Escape') requestClose(); }}
  role="dialog"
  tabindex="-1"
>
  <div
    class="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="document"
  >
    <h2 class="text-lg font-bold text-gray-800 mb-1">Nhập nhiều file CAD</h2>
    <p class="text-xs text-gray-500 mb-4">
      Mỗi file thành một sản phẩm. Mã và tên lấy từ tên file, bỏ phần đuôi —
      <code class="bg-gray-100 px-1 rounded">662-01.dwg</code> thành mã
      <code class="bg-gray-100 px-1 rounded">662-01</code>. Mã đã có trong dự án thì bỏ qua,
      sản phẩm cũ giữ nguyên.
    </p>

    <label class="block mb-4">
      <span class="text-xs font-medium text-gray-500">Chọn file ({ACCEPT})</span>
      <input
        type="file"
        multiple
        accept={ACCEPT}
        disabled={running}
        onchange={onPick}
        class="mt-1 w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-semibold disabled:opacity-50"
      />
      <CadUploadHints />
    </label>

    {#if rows.length > 0}
      <div class="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 sticky top-0">
            <tr>
              <th class="text-left px-3 py-2 font-medium text-gray-500 text-xs">Tên file</th>
              <th class="text-left px-3 py-2 font-medium text-gray-500 text-xs w-56">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.file.name + row.file.size)}
              <tr class="border-t border-gray-100">
                <td class="px-3 py-1.5 text-gray-700 truncate max-w-xs">{row.file.name}</td>
                <td class="px-3 py-1.5 {TONE[row.state]}">
                  {LABEL[row.state]}
                  {#if row.state === 'error'}
                    <span class="text-xs text-gray-500 block truncate">{row.note}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if finished}
      <div class="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700">
        Đã tạo {createdCount}, bỏ qua {skippedCount} (mã đã có), lỗi {errorCount}.
        {#if createdCount > 0}
          <span class="text-gray-500">Kích thước và ảnh sẽ hiện dần khi chuyển đổi xong.</span>
        {/if}
      </div>
    {/if}

    <div class="flex justify-end gap-2 mt-4">
      <button
        onclick={requestClose}
        class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-semibold"
      >
        {finished ? 'Đóng' : 'Hủy'}
      </button>
      <button
        onclick={start}
        disabled={running || rows.length === 0 || finished}
        class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-semibold disabled:opacity-50"
      >
        {running ? 'Đang nhập…' : `Nhập ${rows.length} file`}
      </button>
    </div>
  </div>
</div>
