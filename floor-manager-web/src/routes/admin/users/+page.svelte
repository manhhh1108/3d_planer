<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { authApi, type ApiUser } from '$lib/services/api';

  let { data } = $props();
  let users = $derived(data.users as ApiUser[]);

  let showCreate = $state(false);
  let createForm = $state({ email: '', name: '', role: 'VIEWER' as string, password: '' });
  let createError = $state<string | null>(null);

  let editUser = $state<ApiUser | null>(null);
  let editForm = $state({ name: '', role: '' as string, active: true });
  let editError = $state<string | null>(null);

  let resetUser = $state<ApiUser | null>(null);
  let resetPassword = $state('');
  let resetError = $state<string | null>(null);

  const ROLE_LABELS: Record<string, string> = { ADMIN: 'Admin', PLANNING: 'Planning', VIEWER: 'Viewer' };
  const ROLE_COLORS: Record<string, string> = {
    ADMIN: 'bg-red-100 text-red-700',
    PLANNING: 'bg-blue-100 text-blue-700',
    VIEWER: 'bg-gray-100 text-gray-600',
  };

  async function handleCreate(e: SubmitEvent) {
    e.preventDefault();
    createError = null;
    try {
      await authApi.createUser({ ...createForm, role: createForm.role });
      showCreate = false;
      createForm = { email: '', name: '', role: 'VIEWER', password: '' };
      await invalidateAll();
    } catch {
      createError = 'Email đã tồn tại hoặc có lỗi xảy ra';
    }
  }

  function openEdit(u: ApiUser) {
    editUser = u;
    editForm = { name: u.name, role: u.role, active: u.active };
    editError = null;
  }

  async function handleEdit(e: SubmitEvent) {
    e.preventDefault();
    if (!editUser) return;
    editError = null;
    try {
      await authApi.updateUser(editUser.id, editForm);
      editUser = null;
      await invalidateAll();
    } catch {
      editError = 'Có lỗi xảy ra khi cập nhật người dùng';
    }
  }

  async function handleReset(e: SubmitEvent) {
    e.preventDefault();
    if (!resetUser || resetPassword.length < 6) {
      resetError = 'Mật khẩu tối thiểu 6 ký tự';
      return;
    }
    resetError = null;
    try {
      await authApi.resetPassword(resetUser.id, resetPassword);
      resetUser = null;
      resetPassword = '';
      await invalidateAll();
    } catch {
      resetError = 'Có lỗi xảy ra khi đặt lại mật khẩu';
    }
  }
</script>

<svelte:head><title>Quản lý người dùng — Floor Manager</title></svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
  <div class="max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-gray-800">Quản lý người dùng</h1>
      <button
        onclick={() => (showCreate = true)}
        class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
      >
        + Tạo người dùng
      </button>
    </div>

    <div class="bg-white rounded-xl shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Tên</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Email</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Role</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {#each users as u (u.id)}
            <tr class="border-b last:border-0 hover:bg-gray-50">
              <td class="px-4 py-3 font-medium text-gray-800">{u.name}</td>
              <td class="px-4 py-3 text-gray-600">{u.email}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded text-xs font-medium {ROLE_COLORS[u.role]}">
                  {ROLE_LABELS[u.role]}
                </span>
              </td>
              <td class="px-4 py-3">
                <span class="text-xs {u.active ? 'text-green-600' : 'text-red-500'}">
                  {u.active ? 'Hoạt động' : 'Vô hiệu'}
                </span>
              </td>
              <td class="px-4 py-3 text-right space-x-2">
                <button onclick={() => openEdit(u)} class="text-blue-600 hover:underline text-xs">Sửa</button>
                <button onclick={() => { resetUser = u; resetPassword = ''; resetError = null; }} class="text-gray-500 hover:underline text-xs">Đổi mật khẩu</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Create Modal -->
{#if showCreate}
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div class="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
      <h2 class="text-lg font-semibold mb-4">Tạo người dùng mới</h2>
      <form onsubmit={handleCreate} class="space-y-3">
        <input type="text" bind:value={createForm.name} placeholder="Họ tên" required class="w-full border rounded-lg px-3 py-2 text-sm" />
        <input type="email" bind:value={createForm.email} placeholder="Email" required class="w-full border rounded-lg px-3 py-2 text-sm" />
        <select bind:value={createForm.role} class="w-full border rounded-lg px-3 py-2 text-sm">
          <option value="VIEWER">Viewer</option>
          <option value="PLANNING">Planning</option>
          <option value="ADMIN">Admin</option>
        </select>
        <input type="password" bind:value={createForm.password} placeholder="Mật khẩu (tối thiểu 6 ký tự)" required class="w-full border rounded-lg px-3 py-2 text-sm" />
        {#if createError}<p class="text-xs text-red-600">{createError}</p>{/if}
        <div class="flex gap-2 pt-1">
          <button type="submit" class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Tạo</button>
          <button type="button" onclick={() => { showCreate = false; createError = null; }} class="flex-1 py-2 border rounded-lg text-sm">Huỷ</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Edit Modal -->
{#if editUser}
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div class="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
      <h2 class="text-lg font-semibold mb-4">Sửa: {editUser.email}</h2>
      <form onsubmit={handleEdit} class="space-y-3">
        <input type="text" bind:value={editForm.name} placeholder="Họ tên" required class="w-full border rounded-lg px-3 py-2 text-sm" />
        <select bind:value={editForm.role} class="w-full border rounded-lg px-3 py-2 text-sm">
          <option value="VIEWER">Viewer</option>
          <option value="PLANNING">Planning</option>
          <option value="ADMIN">Admin</option>
        </select>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={editForm.active} />
          Tài khoản hoạt động
        </label>
        {#if editError}<p class="text-xs text-red-600">{editError}</p>{/if}
        <div class="flex gap-2 pt-1">
          <button type="submit" class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Lưu</button>
          <button type="button" onclick={() => { editUser = null; editError = null; }} class="flex-1 py-2 border rounded-lg text-sm">Huỷ</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Reset Password Modal -->
{#if resetUser}
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div class="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
      <h2 class="text-lg font-semibold mb-4">Đặt lại mật khẩu: {resetUser.email}</h2>
      <form onsubmit={handleReset} class="space-y-3">
        <input type="password" bind:value={resetPassword} placeholder="Mật khẩu mới (tối thiểu 6 ký tự)" class="w-full border rounded-lg px-3 py-2 text-sm" />
        {#if resetError}<p class="text-xs text-red-600">{resetError}</p>{/if}
        <div class="flex gap-2 pt-1">
          <button type="submit" class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Đặt lại</button>
          <button type="button" onclick={() => { resetUser = null; resetError = null; }} class="flex-1 py-2 border rounded-lg text-sm">Huỷ</button>
        </div>
      </form>
    </div>
  </div>
{/if}
