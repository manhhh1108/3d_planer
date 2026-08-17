<script lang="ts">
  import { api, type ApiComment } from '$lib/services/api';

  interface Props {
    layoutId: string;
    snapshotId?: string;
    comments: ApiComment[];
    currentUserEmail: string;
    canEdit: boolean;
    onRefresh: () => void;
  }

  let {
    layoutId,
    snapshotId,
    comments,
    currentUserEmail,
    canEdit,
    onRefresh,
  }: Props = $props();

  let newText = $state('');
  let editingId = $state<string | null>(null);
  let editingText = $state('');
  let busy = $state(false);
  let error = $state('');

  async function submit() {
    if (!newText.trim()) return;
    busy = true;
    error = '';
    try {
      await api.comments.create({ layoutId, snapshotId, text: newText.trim() });
      newText = '';
      onRefresh();
    } catch {
      error = 'Không gửi được comment.';
    } finally {
      busy = false;
    }
  }

  async function saveEdit(id: string) {
    if (!editingText.trim()) return;
    busy = true;
    error = '';
    try {
      await api.comments.update(id, editingText.trim());
      editingId = null;
      editingText = '';
      onRefresh();
    } catch {
      error = 'Không lưu được.';
    } finally {
      busy = false;
    }
  }

  async function remove(id: string) {
    if (!confirm('Xóa comment này?')) return;
    busy = true;
    error = '';
    try {
      await api.comments.remove(id);
      onRefresh();
    } catch {
      error = 'Không xóa được.';
    } finally {
      busy = false;
    }
  }

  function startEdit(c: ApiComment) {
    editingId = c.id;
    editingText = c.text;
  }

  function cancelEdit() {
    editingId = null;
    editingText = '';
  }

  function formatTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'vừa xong';
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    return new Date(iso).toLocaleDateString('vi-VN');
  }

  function canModify(c: ApiComment): boolean {
    return canEdit && c.createdBy === currentUserEmail;
  }
</script>

<div class="flex flex-col h-full bg-white">
  <!-- Header -->
  <div class="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
    <span class="text-sm font-semibold text-gray-700">
      {snapshotId ? 'Comment ngày này' : 'Comment layout'}
    </span>
    <span class="text-xs text-gray-400">{comments.length}</span>
  </div>

  <!-- List -->
  <div class="flex-1 overflow-y-auto divide-y divide-gray-100">
    {#if comments.length === 0}
      <p class="p-4 text-xs text-gray-400 text-center">Chưa có comment nào.</p>
    {:else}
      {#each comments as c (c.id)}
        <div class="p-3 hover:bg-gray-50">
          <div class="flex items-baseline gap-2 mb-1">
            <span class="text-xs font-medium text-gray-700">{c.createdBy}</span>
            <span class="text-xs text-gray-400">{formatTime(c.createdAt)}</span>
          </div>

          {#if editingId === c.id}
            <textarea
              bind:value={editingText}
              rows="3"
              class="w-full text-xs border border-gray-300 rounded px-2 py-1 resize-none focus:outline-none focus:border-blue-400"
            ></textarea>
            <div class="flex gap-2 mt-1">
              <button
                onclick={() => saveEdit(c.id)}
                disabled={!editingText.trim() || busy}
                class="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40"
              >Lưu</button>
              <button
                onclick={cancelEdit}
                class="text-xs px-2 py-0.5 bg-gray-200 rounded hover:bg-gray-300"
              >Hủy</button>
            </div>
          {:else}
            <p class="text-xs text-gray-700 leading-relaxed break-words">{c.text}</p>
            {#if c.positionX !== null && c.positionY !== null}
              <p class="text-xs text-blue-400 mt-0.5">📍 ({c.positionX.toFixed(1)}, {c.positionY.toFixed(1)}) m</p>
            {/if}
            {#if canModify(c)}
              <div class="flex gap-2 mt-1">
                <button onclick={() => startEdit(c)} class="text-xs text-blue-500 hover:underline">Sửa</button>
                <button onclick={() => remove(c.id)} class="text-xs text-red-500 hover:underline">Xóa</button>
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Error -->
  {#if error}
    <p class="px-3 py-1 text-xs text-red-500 bg-red-50">{error}</p>
  {/if}

  <!-- Input -->
  {#if canEdit}
    <div class="border-t border-gray-200 p-3">
      <textarea
        bind:value={newText}
        placeholder="Nhập comment..."
        rows="3"
        class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:border-blue-400"
      ></textarea>
      <button
        onclick={submit}
        disabled={!newText.trim() || busy}
        class="w-full mt-2 py-1.5 bg-blue-500 text-white text-xs font-medium rounded hover:bg-blue-600 disabled:opacity-40"
      >
        {busy ? 'Đang gửi...' : 'Gửi'}
      </button>
    </div>
  {:else}
    <p class="px-3 py-2 text-xs text-gray-400 border-t border-gray-200">Bạn không có quyền viết comment.</p>
  {/if}
</div>
