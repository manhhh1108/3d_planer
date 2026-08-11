<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { api, type ApiProject } from '$lib/services/api';

  let projects = $state<ApiProject[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  let showCreateModal = $state(false);
  let newName = $state('');
  let newDesc = $state('');
  let confirmDeleteId = $state<string | null>(null);

  async function refresh() {
    loading = true;
    loadError = null;
    try {
      projects = await api.projects.list();
    } catch (e: any) {
      loadError = 'Không kết nối được backend (http://localhost:4000). Chạy: npm run server trong floor-manager/';
    } finally {
      loading = false;
    }
  }

  onMount(refresh);

  async function createProject() {
    if (!newName.trim()) return;
    const p = await api.projects.create({ name: newName.trim(), description: newDesc.trim() || undefined });
    showCreateModal = false;
    newName = '';
    newDesc = '';
    goto(`${base}/project/${p.id}`);
  }

  async function deleteProject(id: string) {
    await api.projects.remove(id);
    confirmDeleteId = null;
    await refresh();
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('vi-VN');
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <div class="bg-gradient-to-r from-slate-800 to-slate-700 shadow-sm">
    <div class="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white text-lg font-bold">◧</div>
        <div>
          <h1 class="text-2xl font-bold text-white">Floor Manager</h1>
          <p class="text-sm text-white/50 mt-0.5">Quản lý mặt bằng sản xuất · {projects.length} dự án</p>
        </div>
      </div>
      <button
        onclick={() => showCreateModal = true}
        class="px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Tạo dự án mới
      </button>
    </div>
  </div>

  <div class="max-w-5xl mx-auto px-6 py-8">
    {#if loadError}
      <div class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">
        <p class="font-semibold">Lỗi kết nối</p>
        <p>{loadError}</p>
        <button onclick={refresh} class="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">Thử lại</button>
      </div>
    {:else if loading}
      <div class="text-center py-24 text-gray-400">Đang tải...</div>
    {:else if projects.length === 0}
      <div class="text-center py-24">
        <div class="text-5xl mb-4">🏗</div>
        <p class="text-lg text-gray-400 font-medium">Chưa có dự án nào</p>
        <p class="text-sm text-gray-400 mt-1">Tạo dự án đầu tiên để bắt đầu quản lý mặt bằng</p>
        <button onclick={() => showCreateModal = true} class="mt-6 px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold text-sm">
          Tạo dự án
        </button>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {#each projects as project}
          <div class="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-200 transition-all duration-200 relative">
            <a href={`${base}/project/${project.id}`} class="block">
              <h3 class="font-semibold text-gray-800 truncate pr-8">{project.name}</h3>
              <p class="text-sm text-gray-400 mt-1 line-clamp-2 min-h-[2.5rem]">{project.description ?? 'Không có mô tả'}</p>
              <div class="flex gap-2 mt-3">
                <span class="text-[11px] text-gray-500 bg-gray-100 rounded-md px-2 py-0.5">📦 {project._count?.products ?? 0} sản phẩm</span>
                <span class="text-[11px] text-gray-500 bg-gray-100 rounded-md px-2 py-0.5">🗺 {project._count?.layouts ?? 0} mặt bằng</span>
              </div>
              <p class="text-[11px] text-gray-400 mt-3">Cập nhật: {formatDate(project.updatedAt)}</p>
            </a>
            <!-- Delete -->
            {#if confirmDeleteId === project.id}
              <div class="absolute top-3 right-3 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1.5 flex items-center gap-2 z-10">
                <span class="text-xs text-gray-500">Xóa?</span>
                <button onclick={() => deleteProject(project.id)} class="px-2 py-0.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">Có</button>
                <button onclick={() => confirmDeleteId = null} class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300">Không</button>
              </div>
            {:else}
              <button
                onclick={() => confirmDeleteId = project.id}
                class="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                title="Xóa dự án"
                aria-label="Xóa dự án"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Create Modal -->
  {#if showCreateModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={() => showCreateModal = false} onkeydown={(e) => { if (e.key === 'Escape') showCreateModal = false; }} role="dialog" tabindex="-1">
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <h2 class="text-lg font-bold text-gray-800 mb-4">Tạo dự án mới</h2>
        <label class="block mb-3">
          <span class="text-xs font-medium text-gray-500">Tên dự án *</span>
          <input
            type="text"
            bind:value={newName}
            placeholder="VD: Dự án Cầu Long Biên"
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            onkeydown={(e) => { if (e.key === 'Enter') createProject(); }}
          />
        </label>
        <label class="block mb-5">
          <span class="text-xs font-medium text-gray-500">Mô tả</span>
          <textarea
            bind:value={newDesc}
            rows="2"
            placeholder="Mô tả ngắn về dự án..."
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none resize-none"
          ></textarea>
        </label>
        <div class="flex gap-2 justify-end">
          <button onclick={() => showCreateModal = false} class="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
          <button onclick={createProject} disabled={!newName.trim()} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">Tạo dự án</button>
        </div>
      </div>
    </div>
  {/if}
</div>
