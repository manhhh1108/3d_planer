import { writable } from 'svelte/store';

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	role: 'ADMIN' | 'PLANNING' | 'VIEWER';
	active: boolean;
}

export const currentUser = writable<AuthUser | null>(null);
