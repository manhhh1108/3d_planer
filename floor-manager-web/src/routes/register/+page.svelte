<script lang="ts">
  import { goto } from '$app/navigation';
  import { authApi } from '$lib/services/api';
  import { currentUser } from '$lib/stores/auth';

  let email = $state('');
  let name = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      error = 'Mật khẩu xác nhận không khớp';
      return;
    }
    loading = true;
    error = null;
    try {
      const user = await authApi.register(email, name, password);
      currentUser.set(user);
      if (user.role === 'PENDING') {
        goto('/pending');
      } else {
        goto('/');
      }
    } catch (e: any) {
      if (e.message?.includes('409')) {
        error = 'Email đã tồn tại';
      } else if (e.message?.includes('400')) {
        error = 'Vui lòng điền đầy đủ thông tin (mật khẩu ít nhất 6 ký tự)';
      } else {
        error = 'Đăng ký thất bại. Vui lòng thử lại.';
      }
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Đăng ký — Floor Manager</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50">
  <div class="w-full max-w-sm bg-white rounded-xl shadow-md p-8">
    <h1 class="text-2xl font-bold text-gray-800 mb-6 text-center">Đăng ký tài khoản</h1>

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="name">Họ tên</label>
        <input
          id="name"
          type="text"
          bind:value={name}
          required
          placeholder="Nguyễn Văn A"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          required
          autocomplete="email"
          placeholder="email@company.com"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="password">Mật khẩu</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          required
          minlength="6"
          autocomplete="new-password"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="confirmPassword">Xác nhận mật khẩu</label>
        <input
          id="confirmPassword"
          type="password"
          bind:value={confirmPassword}
          required
          minlength="6"
          autocomplete="new-password"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      {#if error}
        <p class="text-sm text-red-600">{error}</p>
      {/if}

      <button
        type="submit"
        disabled={loading}
        class="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Đang đăng ký...' : 'Đăng ký'}
      </button>
    </form>

    <p class="mt-4 text-center text-sm text-gray-500">
      Đã có tài khoản? <a href="/login" class="text-blue-600 hover:underline">Đăng nhập</a>
    </p>
  </div>
</div>
