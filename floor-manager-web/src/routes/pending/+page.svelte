<script lang="ts">
  import { goto } from '$app/navigation';
  import { authApi } from '$lib/services/api';
  import { currentUser } from '$lib/stores/auth';

  let user = $state<{ name: string; email: string; role: string } | null>(null);
  let checking = $state(true);

  import { onMount } from 'svelte';

  onMount(async () => {
    try {
      const me = await authApi.me();
      user = me;
      if (me.role !== 'PENDING') {
        goto('/');
      }
    } catch {
      goto('/login');
    } finally {
      checking = false;
    }
  });

  async function handleLogout() {
    await authApi.logout();
    currentUser.set(null);
    goto('/login');
  }

  async function checkStatus() {
    try {
      const me = await authApi.me();
      if (me.role !== 'PENDING') {
        currentUser.set(me);
        goto('/');
      }
    } catch {
      // still pending
    }
  }
</script>

<svelte:head>
  <title>Chờ phân quyền — Floor Manager</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-blue-50">
  {#if !checking && user}
    <div class="w-full max-w-lg text-center px-6">
      <span class="inline-block px-4 py-1.5 bg-amber-400 text-white text-sm font-semibold rounded-full mb-4">Chưa được cấp quyền</span>

      <h1 class="text-2xl font-bold text-gray-800 mb-3">Tài khoản của bạn đang chờ phân quyền</h1>

      <p class="text-gray-500 text-sm mb-8">
        Xin chào <strong>{user.name}</strong>, tài khoản <strong>{user.email}</strong> đã đăng nhập thành công
        nhưng chưa được gán quyền sử dụng hệ thống. Vui lòng liên hệ quản trị viên để được cấp quyền.
      </p>

      <div class="flex items-center justify-center gap-3">
        <button
          onclick={checkStatus}
          class="px-5 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
        >Kiểm tra lại</button>
        <button
          onclick={handleLogout}
          class="px-5 py-2.5 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >Đăng xuất</button>
      </div>
    </div>
  {:else}
    <div class="text-gray-400 text-sm">Đang kiểm tra...</div>
  {/if}
</div>
