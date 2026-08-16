import { writable, derived } from 'svelte/store';

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	role: 'ADMIN' | 'PLANNING' | 'VIEWER' | 'PENDING';
	active: boolean;
}

export const currentUser = writable<AuthUser | null>(null);

/** true nếu user có quyền tạo/sửa/xóa (ADMIN hoặc PLANNING) */
export const canEdit = derived(currentUser, (u) => u?.role === 'ADMIN' || u?.role === 'PLANNING');
