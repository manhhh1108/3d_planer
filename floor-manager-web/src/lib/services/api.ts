// REST client cho backend floor-manager (Express :4000)
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
export const FILES_BASE = BASE.replace(/\/api$/, '');

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
	_count?: { products: number };
}

export interface ApiSite {
	id: string;
	name: string;
	address: string | null;
	active: boolean;
	createdAt: string;
	_count?: { layouts: number };
	layouts?: (ApiLayout & { _count?: { snapshots: number } })[];
}

export interface ApiAsset {
	id: string;
	fileName: string;
	fileType: string;
	status: 'pending' | 'processing' | 'ready' | 'failed';
	error: string | null;
	unitScale: number;
	bboxLengthM: number | null;
	bboxWidthM: number | null;
	bboxHeightM: number | null;
	areaM2: number | null;
	createdAt: string;
	footprintUrl: string | null;
	meshUrl: string | null;
	thumbUrl: string | null;
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
	assetId: string | null;
	asset?: ApiAsset | null;
}

export interface ApiLayout {
	id: string;
	siteId: string;
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
	orientation: string;
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
			http<ApiProject & { products: ApiProduct[] }>(`/projects/${id}`),
		create: (data: { name: string; description?: string }) =>
			http<ApiProject>('/projects', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: { name?: string; description?: string }) =>
			http<ApiProject>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/projects/${id}`, { method: 'DELETE' }),
	},
	sites: {
		list: () => http<ApiSite[]>('/sites'),
		get: (id: string) => http<ApiSite>(`/sites/${id}`),
		create: (data: { name: string; address?: string }) =>
			http<ApiSite>('/sites', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: { name?: string; address?: string; active?: boolean }) =>
			http<ApiSite>(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/sites/${id}`, { method: 'DELETE' }),
	},
	products: {
		list: (projectId?: string) =>
			http<ApiProduct[]>(projectId ? `/products?projectId=${projectId}` : '/products'),
		create: (data: Partial<ApiProduct> & { projectId: string; name: string; code: string }) =>
			http<ApiProduct>('/products', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: Partial<ApiProduct>) =>
			http<ApiProduct>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/products/${id}`, { method: 'DELETE' }),
	},
	layouts: {
		list: (siteId?: string) =>
			http<ApiLayout[]>(siteId ? `/layouts?siteId=${siteId}` : '/layouts'),
		get: (id: string) => http<ApiLayout>(`/layouts/${id}`),
		create: (data: {
			siteId: string;
			name: string;
			widthM: number;
			heightM: number;
			gridSize?: number;
		}) => http<ApiLayout>('/layouts', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: Partial<Omit<ApiLayout, 'id' | 'siteId' | 'snapshots'>>) =>
			http<ApiLayout>(`/layouts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/layouts/${id}`, { method: 'DELETE' }),
	},
	reports: {
		summary: (layoutId: string, date: string) =>
			http<{
				snapshot: ApiSnapshot;
				totalArea: number;
				totalWeight: number;
				layoutArea: number;
				usageRate: number;
			}>(`/reports/summary?layoutId=${layoutId}&date=${date}`),
		byProcess: (layoutId: string, date: string) =>
			http<
				{
					processStage: string;
					count: number;
					totalArea: number;
					totalWeight: number;
					areaPercent: number;
				}[]
			>(`/reports/by-process?layoutId=${layoutId}&date=${date}`),
		occupation: (projectId?: string) =>
			http<
				{
					productName: string;
					productCode: string;
					projectName: string;
					layoutName: string;
					startDate: string;
					endDate: string;
					days: number;
					areaM2: number;
					areaDays: number;
				}[]
			>(projectId ? `/reports/occupation?projectId=${projectId}` : '/reports/occupation'),
	},
	assets: {
		get: (id: string) => http<ApiAsset>(`/assets/${id}`),
		remove: (id: string) => http<void>(`/assets/${id}`, { method: 'DELETE' }),
		upload: async (file: File, productId?: string, unitScale?: number): Promise<ApiAsset> => {
			const fd = new FormData();
			fd.append('file', file);
			if (productId) fd.append('productId', productId);
			if (unitScale) fd.append('unitScale', String(unitScale));
			const res = await fetch(`${BASE}/assets`, { method: 'POST', body: fd });
			if (!res.ok) throw new Error(`API POST /assets: ${res.status}`);
			return res.json();
		},
	},
	snapshots: {
		list: (layoutId: string) => http<ApiSnapshot[]>(`/snapshots?layoutId=${layoutId}`),
		get: (id: string) => http<ApiSnapshot>(`/snapshots/${id}`),
		save: (data: {
			layoutId: string;
			date: string;
			note?: string;
			positions: {
				productId: string;
				x: number;
				y: number;
				rotation?: number;
				scale?: number;
				orientation?: string;
			}[];
		}) => http<ApiSnapshot>('/snapshots', { method: 'POST', body: JSON.stringify(data) }),
	},
};
