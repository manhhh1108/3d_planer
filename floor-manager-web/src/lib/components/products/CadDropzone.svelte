<script lang="ts">
  import type { ApiAsset } from '$lib/services/api';
  import CadUploadHints from './CadUploadHints.svelte';

  const CAD_EXTENSIONS = ['dwg', 'dxf', 'step', 'stp', 'ifc'];
  const MAX_BYTES = 200 * 1024 * 1024;

  interface Props {
    asset: ApiAsset | null;
    pendingFile: File | null;
    disabled?: boolean;
    onselect: (file: File) => void;
    onclear: () => void;
  }

  let { asset, pendingFile, disabled = false, onselect, onclear }: Props = $props();

  let dragging = $state(false);
  let localError = $state<string | null>(null);
  let inputEl: HTMLInputElement;

  function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  // Chặn sớm ở client để khỏi tốn băng thông với file sai định dạng / quá lớn
  function accept(file: File) {
    localError = null;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!CAD_EXTENSIONS.includes(ext)) {
      localError = `Không hỗ trợ file .${ext} — chỉ nhận ${CAD_EXTENSIONS.join(', ')}`;
      return;
    }
    if (file.size > MAX_BYTES) {
      localError = `File ${formatSize(file.size)} vượt giới hạn 200 MB`;
      return;
    }
    onselect(file);
  }

  function onChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) accept(file);
    input.value = '';
  }

  function onDrop(ev: DragEvent) {
    ev.preventDefault();
    dragging = false;
    if (disabled) return;
    const file = ev.dataTransfer?.files?.[0];
    if (file) accept(file);
  }

  function clear() {
    localError = null;
    onclear();
  }
</script>

<div class="col-span-2">
  <span class="text-xs font-medium text-gray-500">File CAD sản phẩm</span>

  <div
    class="mt-1 rounded-lg border border-dashed px-3 py-3 transition-colors
      {dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50/60'}
      {disabled ? 'opacity-60' : ''}"
    ondragover={(e) => { e.preventDefault(); if (!disabled) dragging = true; }}
    ondragleave={() => dragging = false}
    ondrop={onDrop}
    role="group"
  >
    <input
      bind:this={inputEl}
      type="file"
      accept=".dwg,.dxf,.step,.stp,.ifc"
      class="hidden"
      {disabled}
      onchange={onChange}
    />

    {#if pendingFile}
      <div class="flex items-center gap-2">
        <svg class="text-blue-500 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <div class="min-w-0 flex-1">
          <p class="text-sm text-gray-700 truncate">{pendingFile.name}</p>
          <p class="text-[11px] text-gray-400">{formatSize(pendingFile.size)} · sẽ tải lên khi bấm Lưu</p>
        </div>
        <button
          type="button"
          onclick={clear}
          {disabled}
          class="text-gray-400 hover:text-red-500 text-sm leading-none px-1 disabled:hover:text-gray-400"
          aria-label="Bỏ chọn file"
        >✕</button>
      </div>
    {:else if asset}
      <div class="flex items-center gap-2">
        {#if asset.status === 'ready'}
          <span class="text-[11px] px-2 py-0.5 rounded-md bg-green-50 text-green-600 font-medium shrink-0">{asset.fileType.toUpperCase()}</span>
        {:else if asset.status === 'failed'}
          <span class="text-[11px] px-2 py-0.5 rounded-md bg-red-50 text-red-600 font-medium shrink-0">Lỗi</span>
        {:else}
          <span class="text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 font-medium shrink-0">Đang xử lý…</span>
        {/if}
        <div class="min-w-0 flex-1">
          <p class="text-sm text-gray-700 truncate">{asset.fileName}</p>
          {#if asset.status === 'failed'}
            <p class="text-[11px] text-red-500">{asset.error ?? 'Convert lỗi không rõ nguyên nhân'}</p>
          {/if}
        </div>
        <button
          type="button"
          onclick={() => inputEl.click()}
          {disabled}
          class="text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0 disabled:opacity-50"
        >{asset.status === 'failed' ? 'Chọn lại file' : 'Thay file'}</button>
      </div>
    {:else}
      <button
        type="button"
        onclick={() => inputEl.click()}
        {disabled}
        class="w-full flex flex-col items-center gap-1 py-1 text-gray-400 hover:text-blue-500 transition-colors disabled:hover:text-gray-400"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span class="text-sm font-medium">Kéo thả hoặc bấm để chọn file CAD</span>
        <span class="text-[11px]">dwg, dxf, step, stp, ifc — tối đa 200 MB</span>
      </button>
    {/if}
  </div>

  {#if localError}
    <p class="mt-1 text-xs text-red-600">{localError}</p>
  {/if}

  <CadUploadHints />
</div>
