<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authApi } from '$lib/services/api';
	import { currentUser } from '$lib/stores/auth';

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		error = null;
		try {
			const user = await authApi.login(email, password);
			currentUser.set(user);
			if (user.role === 'PENDING') {
				goto('/pending');
			} else {
				const redirect = $page.url.searchParams.get('redirect') || '/';
				goto(redirect);
			}
		} catch (e: any) {
			const msg = e?.message ?? '';
			if (msg.includes('401')) {
				error = 'Email hoặc mật khẩu không đúng';
			} else if (msg.includes('403')) {
				error = 'Tài khoản đã bị vô hiệu hoá';
			} else {
				error = `Không kết nối được server (${msg || 'kiểm tra backend đang chạy'})`;
			}
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Đăng nhập — Floor Manager</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50">
	<div class="w-full max-w-sm bg-white rounded-xl shadow-md p-8">
		<h1 class="text-2xl font-bold text-gray-800 mb-6 text-center">Floor Manager</h1>

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1" for="email">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					required
					autocomplete="email"
					placeholder="admin@example.com"
					class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1" for="password"
					>Mật khẩu</label
				>
				<input
					id="password"
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
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
				{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
			</button>
		</form>

		<p class="mt-4 text-center text-sm text-gray-500">
			Chưa có tài khoản? <a href="/register" class="text-blue-600 hover:underline">Đăng ký</a>
		</p>
	</div>
</div>
