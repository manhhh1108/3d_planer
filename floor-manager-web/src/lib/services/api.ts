// REST client cho backend floor-manager (Express :4000)
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
// File tĩnh đi qua chính /api — reverse proxy production chỉ forward /api,
// nên /uploads ở root sẽ rơi vào frontend và trả 404.
export const FILES_BASE = BASE.replace(/\/$/, '');

async function http<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
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
	/** Tên công ty in vào khung tên bản vẽ */
	companyName: string | null;
	/** Đường dẫn logo đã tải lên, kiểu /uploads/sites/<id>/logo.png */
	companyLogo: string | null;
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
	quantity: number;
	metadata: { widthM?: number; depthM?: number; heightM?: number } | null;
	assetId: string | null;
	asset?: ApiAsset | null;
}

/** Ai đang mở một (mặt bằng, ngày) để chỉnh sửa */
export interface ApiEditLock {
	locked: boolean;
	mine: boolean;
	holder: {
		userId: string;
		email: string;
		name: string;
		acquiredAt: string;
		expiresAt: string;
	} | null;
}

/** Sản phẩm đang được bố trí ở mặt bằng nào, bao nhiêu bản */
export interface ApiProductUsage {
	productId: string;
	count: number;
	layouts: { layoutId: string; layoutName: string; siteName: string; count: number }[];
}

/** Kết quả nhập một file CAD. `skipped` nghĩa là mã đã có sẵn trong dự án. */
export interface ApiImportCadResult {
	action: 'created' | 'skipped';
	code: string;
	productId: string | null;
	assetId?: string;
}

export interface DxfInsertData {
	blockName: string;
	xCm: number;
	yCm: number;
	rotationDeg: number;
	svgPreview: string;
	/** Layer của INSERT — thường dễ đọc hơn tên block sinh tự động */
	layer: string;
	/** Kích thước block khi đã đặt xuống bản vẽ (đã nhân tỉ lệ), cm */
	widthCm: number;
	heightCm: number;
}

/** Tường của mặt bằng như backend lưu — toạ độ và kích thước theo mét */
export interface ApiWall {
	id: string;
	start: { x: number; y: number };
	end: { x: number; y: number };
	thickness: number;
	height: number;
	color: string;
	curvePoint?: { x: number; y: number };
}

/** Vùng như backend lưu — toạ độ theo mét */
export interface ApiZone {
	id: string;
	name?: string;
	points: { x: number; y: number }[];
	allowedStageIds: string[];
}

export interface ApiLayout {
	id: string;
	siteId: string;
	name: string;
	widthM: number;
	heightM: number;
	backgroundFile: string | null;
	gridSize: number;
	/** Block DXF nào ứng với sản phẩm nào: { "<tên block>": "<productId>" } */
	dxfBlockMap?: Record<string, string> | null;
	/** Căn ảnh nền với bản vẽ — xem LayoutBgTransform ở utils/layoutBackground */
	bgTransform?: unknown;
	/** Chỉ có trong GET /layouts/:id — danh sách layout không kèm tường */
	walls?: ApiWall[];
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
	/** Cao độ đáy block so với sàn, mét */
	elevationM?: number;
	/** Email người thao tác cuối với block này */
	updatedBy?: string | null;
	updatedAt?: string | null;
	product?: ApiProduct;
}

export interface ApiSnapshot {
	id: string;
	layoutId: string;
	date: string;
	note: string | null;
	/** Ảnh xem trước mặt bằng, đường dẫn tương đối backend */
	thumbnail?: string | null;
	positions?: ApiPosition[];
	zones?: ApiZone[] | null;
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
		update: (
			id: string,
			data: { name?: string; address?: string; active?: boolean; companyName?: string }
		) => http<ApiSite>(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/sites/${id}`, { method: 'DELETE' }),
		/** Logo công ty — PNG/JPEG/WEBP, tối đa 1MB */
		uploadLogo: async (id: string, file: File): Promise<ApiSite> => {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch(`${BASE}/sites/${id}/logo`, {
				method: 'PUT',
				body: fd,
				credentials: 'include',
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error((body as any).error ?? `Tải logo thất bại (${res.status})`);
			}
			return res.json();
		},
		removeLogo: (id: string) => http<ApiSite>(`/sites/${id}/logo`, { method: 'DELETE' }),
	},
	files: {
		/** Upload ảnh/tệp lẻ, trả về đường dẫn tương đối kiểu /uploads/<tên> */
		upload: async (file: File): Promise<{ path: string }> => {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch(`${BASE}/files/upload`, {
				method: 'POST',
				body: fd,
				credentials: 'include',
			});
			if (!res.ok) {
				const detail = await res
					.json()
					.then((b) => (b && typeof b.error === 'string' ? b.error : null))
					.catch(() => null);
				throw new Error(detail ?? `API POST /files/upload: ${res.status}`);
			}
			return res.json();
		},
	},
	products: {
		list: (projectId?: string) =>
			http<ApiProduct[]>(projectId ? `/products?projectId=${projectId}` : '/products'),
		/** Số bản đang nằm ở các mặt bằng khác (bỏ qua mặt bằng đang mở) */
		usage: (excludeLayoutId?: string) =>
			http<ApiProductUsage[]>(
				excludeLayoutId ? `/products/usage?excludeLayoutId=${excludeLayoutId}` : '/products/usage'
			),
		create: (data: Partial<ApiProduct> & { projectId: string; name: string; code: string }) =>
			http<ApiProduct>('/products', { method: 'POST', body: JSON.stringify(data) }),
		/**
		 * Nhập một file CAD thành một sản phẩm. Mã và tên lấy từ tên file.
		 * Mã đã tồn tại trong dự án thì máy chủ bỏ qua và trả `action: 'skipped'`.
		 */
		importCad: async (projectId: string, file: File): Promise<ApiImportCadResult> => {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('projectId', projectId);
			const res = await fetch(`${BASE}/products/import-cad`, {
				method: 'POST',
				body: fd,
				credentials: 'include',
			});
			if (!res.ok) {
				// Server trả { error } — giữ lại message thật thay vì chỉ mã HTTP
				const detail = await res
					.json()
					.then((b) => (b && typeof b.error === 'string' ? b.error : null))
					.catch(() => null);
				throw new Error(detail ?? `API POST /products/import-cad: ${res.status}`);
			}
			return res.json();
		},
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
		/** Ai đang giữ quyền chỉnh sửa (layout, ngày) */
		getLock: (id: string, date: string) =>
			http<ApiEditLock>(`/layouts/${id}/lock?date=${date}`),
		/** Giành hoặc gia hạn khoá. Người khác đang giữ thì trả về chính họ. */
		acquireLock: (id: string, date: string) =>
			http<ApiEditLock>(`/layouts/${id}/lock`, {
				method: 'PUT',
				body: JSON.stringify({ date }),
			}),
		releaseLock: (id: string, date: string) =>
			http<ApiEditLock>(`/layouts/${id}/lock?date=${date}`, { method: 'DELETE' }),
		saveWalls: (id: string, walls: ApiWall[]) =>
			http<ApiLayout>(`/layouts/${id}/walls`, {
				method: 'PUT',
				body: JSON.stringify({ walls }),
			}),
		uploadBackground: async (id: string, file: File): Promise<ApiLayout> => {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch(`${BASE}/layouts/${id}/background`, {
				method: 'POST',
				body: fd,
				credentials: 'include',
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error((body as any).error ?? `Upload nền thất bại (${res.status})`);
			}
			return res.json();
		},
		deleteBackground: (id: string) =>
			http<ApiLayout>(`/layouts/${id}/background`, { method: 'DELETE' }),
		fetchInserts: (id: string) =>
			http<DxfInsertData[]>(`/layouts/${id}/background/inserts`),
		/** Nhớ mapping block DXF -> sản phẩm cho lần nhập sau */
		saveDxfMap: (id: string, dxfBlockMap: Record<string, string>) =>
			http<ApiLayout>(`/layouts/${id}/dxf-map`, {
				method: 'PUT',
				body: JSON.stringify({ dxfBlockMap }),
			}),
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
    byProcessRange: (layoutId: string, startDate: string, endDate: string) =>
      http<{ date: string; stages: Record<string, number> }[]>(
        `/reports/by-process-range?layoutId=${layoutId}&startDate=${startDate}&endDate=${endDate}`
      ),
    occupation: (params?: {
      projectId?: string;
      layoutId?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.projectId) q.set('projectId', params.projectId);
      if (params?.layoutId) q.set('layoutId', params.layoutId);
      if (params?.startDate) q.set('startDate', params.startDate);
      if (params?.endDate) q.set('endDate', params.endDate);
      const qs = q.toString();
      return http<
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
      >(`/reports/occupation${qs ? `?${qs}` : ''}`);
    },
  },
	assets: {
		get: (id: string) => http<ApiAsset>(`/assets/${id}`),
		remove: (id: string) => http<void>(`/assets/${id}`, { method: 'DELETE' }),
		upload: async (file: File, productId?: string, unitScale?: number): Promise<ApiAsset> => {
			const fd = new FormData();
			fd.append('file', file);
			if (productId) fd.append('productId', productId);
			if (unitScale) fd.append('unitScale', String(unitScale));
			const res = await fetch(`${BASE}/assets`, { method: 'POST', body: fd, credentials: 'include' });
			if (!res.ok) {
				// Server trả { error } — giữ lại message thật thay vì chỉ mã HTTP
				const detail = await res
					.json()
					.then((b) => (b && typeof b.error === 'string' ? b.error : null))
					.catch(() => null);
				throw new Error(detail ?? `API POST /assets: ${res.status}`);
			}
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
				elevationM?: number;
			}[];
			zones?: ApiZone[];
		}) => http<ApiSnapshot>('/snapshots', { method: 'POST', body: JSON.stringify(data) }),
		uploadThumbnail: async (id: string, image: Blob): Promise<ApiSnapshot> => {
			const fd = new FormData();
			fd.append('file', image, 'thumb.jpg');
			const res = await fetch(`${BASE}/snapshots/${id}/thumbnail`, {
				method: 'PUT',
				body: fd,
				credentials: 'include',
			});
			if (!res.ok) throw new Error(`API PUT /snapshots/${id}/thumbnail: ${res.status}`);
			return res.json();
		},
	},
	dashboard: {
		get: (date?: string) =>
			http<ApiDashboard>(date ? `/dashboard?date=${date}` : '/dashboard'),
	},
	plans: {
		list: (layoutId: string) => http<ApiPlan[]>(`/plans?layoutId=${layoutId}`),
		create: (data: { layoutId: string; name: string }) =>
			http<ApiPlan>('/plans', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: { name?: string; active?: boolean; version?: number }) =>
			http<ApiPlan>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/plans/${id}`, { method: 'DELETE' }),
		items: (planId: string) => http<ApiPlanItem[]>(`/plans/${planId}/items`),
		createItem: (planId: string, data: { productId: string; x: number; y: number; rotation?: number; startDate: string; endDate: string; planVersion?: number }) =>
			http<ApiPlanItem>(`/plans/${planId}/items`, { method: 'POST', body: JSON.stringify(data) }),
		updateItem: (itemId: string, data: { x?: number; y?: number; rotation?: number; startDate?: string; endDate?: string; planVersion?: number }) =>
			http<ApiPlanItem>(`/plans/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
		removeItem: (itemId: string, planVersion?: number) =>
			http<void>(`/plans/items/${itemId}`, { method: 'DELETE', body: planVersion !== undefined ? JSON.stringify({ planVersion }) : undefined }),
		conflicts: (planId: string) => http<ApiConflictResult>(`/plans/${planId}/conflicts`),
		compare: (planId: string, snapshotId?: string) =>
			http<ApiCompareResult>(`/plans/${planId}/compare${snapshotId ? `?snapshotId=${snapshotId}` : ''}`),
	},
	comments: {
		list: (layoutId: string, snapshotId?: string) =>
			http<ApiComment[]>(
				`/comments?layoutId=${layoutId}${snapshotId ? `&snapshotId=${snapshotId}` : ''}`
			),
		create: (data: {
			layoutId: string;
			snapshotId?: string;
			positionX?: number;
			positionY?: number;
			text: string;
		}) =>
			http<ApiComment>('/comments', {
				method: 'POST',
				body: JSON.stringify(data),
			}),
		update: (id: string, text: string) =>
			http<ApiComment>(`/comments/${id}`, {
				method: 'PUT',
				body: JSON.stringify({ text }),
			}),
		remove: (id: string) =>
			http<void>(`/comments/${id}`, { method: 'DELETE' }),
	},
	stages: {
		list: (all = false) => http<ApiStage[]>(`/stages${all ? '?all=1' : ''}`),
		create: (data: { name: string; color: string; order?: number }) =>
			http<ApiStage>('/stages', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: { name?: string; color?: string; order?: number; active?: boolean }) =>
			http<ApiStage>(`/stages/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
		remove: (id: string) => http<ApiStage>(`/stages/${id}`, { method: 'DELETE' }),
	},
	settings: {
		get: <T = unknown>(key: string) => http<{ key: string; value: T }>(`/settings/${key}`),
		put: <T = unknown>(key: string, value: T) =>
			http<{ key: string; value: T }>(`/settings/${key}`, {
				method: 'PUT',
				body: JSON.stringify({ value }),
			}),
	},
};

export interface ApiDashboard {
  counts: {
    sites: number;
    projects: number;
    productsOnLayout: number;
    totalWeightKg: number;
    totalAreaM2: number;
  };
  layoutUsage: {
    layoutId: string;
    layoutName: string;
    siteName: string;
    usedAreaM2: number;
    totalAreaM2: number;
    usagePercent: number;
    productCount: number;
  }[];
  byProcessStage: {
    stage: string;
    count: number;
    totalAreaM2: number;
    totalWeightKg: number;
  }[];
  recentActivity: {
    type: 'snapshot' | 'product';
    description: string;
    layoutId?: string;
    projectId?: string;
    createdBy: string | null;
    createdAt: string;
  }[];
}

export interface ApiPlan {
  id: string;
  layoutId: string;
  name: string;
  active: boolean;
  version: number;
  createdAt: string;
  _count?: { items: number };
}

export interface ApiPlanItem {
  id: string;
  planId: string;
  productId: string;
  x: number;
  y: number;
  rotation: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  product?: {
    id: string;
    name: string;
    code: string;
    processStage: string | null;
    color: string;
    areaM2: number | null;
    weightKg: number | null;
    metadata: { widthM?: number; depthM?: number; heightM?: number } | null;
  };
}

export interface ApiComment {
  id: string;
  layoutId: string;
  snapshotId: string | null;
  positionX: number | null;
  positionY: number | null;
  text: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiStage {
  id: string;
  name: string;
  color: string;
  order: number;
  active: boolean;
  createdAt: string;
}

export type OutsideZonePolicy = 'block' | 'warn' | 'silent';

export interface ApiConflict {
  itemA: { id: string; productName: string; startDate: string; endDate: string };
  itemB: { id: string; productName: string; startDate: string; endDate: string };
  overlapStart: string;
  overlapEnd: string;
}

export interface ApiConflictResult {
  conflicts: ApiConflict[];
  suggestions: { itemId: string; suggestedStart: string; reason: string }[];
}

export interface ApiCompareItem {
  productId: string;
  productName: string;
  productCode: string;
  status: 'matched' | 'misplaced' | 'missing' | 'unplanned';
  planned: { x: number; y: number } | null;
  actual: { x: number; y: number } | null;
  distanceM: number | null;
}

export interface ApiCompareResult {
  planId: string;
  snapshotId: string | null;
  snapshotDate: string | null;
  items: ApiCompareItem[];
  summary: { matched: number; misplaced: number; missing: number; unplanned: number };
}

export interface ApiUser {
	id: string;
	email: string;
	name: string;
	role: 'ADMIN' | 'PLANNING' | 'VIEWER' | 'PENDING';
	active: boolean;
	createdAt: string;
}

export const authApi = {
	login: (email: string, password: string) =>
		http<ApiUser>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

	register: (email: string, name: string, password: string) =>
		http<ApiUser>('/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password }) }),

	logout: () =>
		http<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

	me: () => http<ApiUser>('/auth/me'),

	listUsers: () => http<ApiUser[]>('/users'),

	createUser: (data: { email: string; name: string; role: string; password: string }) =>
		http<ApiUser>('/users', { method: 'POST', body: JSON.stringify(data) }),

	updateUser: (id: string, data: { name?: string; role?: string; active?: boolean }) =>
		http<ApiUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

	resetPassword: (id: string, password: string) =>
		http<{ ok: boolean }>(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
};
