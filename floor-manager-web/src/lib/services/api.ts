// REST client cho backend floor-manager (Express :4000)
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { 'Content-Type': 'application/json' },
		...init,
	});
	if (!res.ok) throw new Error(`API ${init?.method ?? 'GET'} ${path}: ${res.status}`);
	return res.status === 204 ? (undefined as T) : res.json();
}

export interface ApiProject {
	id: string;
	name: string;
	description: string | null;
	createdAt: string;
	updatedAt: string;
	_count?: { layouts: number; products: number };
}

export interface ApiProduct {
	id: string;
	projectId: string;
	name: string;
	code: string;
	weightKg: number | null;
	areaM2: number | null;
	processStage: string | null;
	category: string;
	color: string;
	file2dUrl: string | null;
	file3dUrl: string | null;
	thumbnail: string | null;
	sharepointLink: string | null;
	metadata: { widthM?: number; depthM?: number; heightM?: number } | null;
}

export interface ApiLayout {
	id: string;
	projectId: string;
	name: string;
	widthM: number;
	heightM: number;
	backgroundFile: string | null;
	gridSize: number;
	snapshots?: ApiSnapshot[];
}

export interface ApiPosition {
	id: string;
	snapshotId: string;
	productId: string;
	x: number;
	y: number;
	rotation: number;
	scale: number;
	product?: ApiProduct;
}

export interface ApiSnapshot {
	id: string;
	layoutId: string;
	date: string;
	note: string | null;
	positions?: ApiPosition[];
}

export const api = {
	projects: {
		list: () => http<ApiProject[]>('/projects'),
		get: (id: string) =>
			http<ApiProject & { layouts: ApiLayout[]; products: ApiProduct[] }>(`/projects/${id}`),
		create: (data: { name: string; description?: string }) =>
			http<ApiProject>('/projects', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: { name?: string; description?: string }) =>
			http<ApiProject>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/projects/${id}`, { method: 'DELETE' }),
	},
	products: {
		list: (projectId: string) => http<ApiProduct[]>(`/products?projectId=${projectId}`),
		create: (data: Partial<ApiProduct> & { projectId: string; name: string; code: string }) =>
			http<ApiProduct>('/products', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: Partial<ApiProduct>) =>
			http<ApiProduct>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/products/${id}`, { method: 'DELETE' }),
	},
	layouts: {
		list: (projectId: string) => http<ApiLayout[]>(`/layouts?projectId=${projectId}`),
		get: (id: string) => http<ApiLayout>(`/layouts/${id}`),
		create: (data: {
			projectId: string;
			name: string;
			widthM: number;
			heightM: number;
			gridSize?: number;
		}) => http<ApiLayout>('/layouts', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: Partial<Omit<ApiLayout, 'id' | 'projectId' | 'snapshots'>>) =>
			http<ApiLayout>(`/layouts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/layouts/${id}`, { method: 'DELETE' }),
	},
	snapshots: {
		list: (layoutId: string) => http<ApiSnapshot[]>(`/snapshots?layoutId=${layoutId}`),
		get: (id: string) => http<ApiSnapshot>(`/snapshots/${id}`),
		save: (data: {
			layoutId: string;
			date: string;
			note?: string;
			positions: { productId: string; x: number; y: number; rotation?: number; scale?: number }[];
		}) => http<ApiSnapshot>('/snapshots', { method: 'POST', body: JSON.stringify(data) }),
	},
};
