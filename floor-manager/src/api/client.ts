const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Projects
  getProjects: () => request<any[]>('/projects'),
  getProject: (id: string) => request<any>(`/projects/${id}`),
  createProject: (data: { name: string; description?: string }) =>
    request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: { name: string; description?: string }) =>
    request<any>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, { method: 'DELETE' }),

  // Products
  getProducts: (projectId: string) => request<any[]>(`/products?projectId=${projectId}`),
  createProduct: (data: any) =>
    request<any>('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: any) =>
    request<any>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE' }),

  // Layouts
  getLayouts: (projectId: string) => request<any[]>(`/layouts?projectId=${projectId}`),
  getLayout: (id: string) => request<any>(`/layouts/${id}`),
  createLayout: (data: any) =>
    request<any>('/layouts', { method: 'POST', body: JSON.stringify(data) }),
  updateLayout: (id: string, data: any) =>
    request<any>(`/layouts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLayout: (id: string) =>
    request<void>(`/layouts/${id}`, { method: 'DELETE' }),

  // Snapshots
  getSnapshots: (layoutId: string) => request<any[]>(`/snapshots?layoutId=${layoutId}`),
  getSnapshot: (id: string) => request<any>(`/snapshots/${id}`),
  saveSnapshot: (data: { layoutId: string; date: string; note?: string; positions: any[] }) =>
    request<any>('/snapshots', { method: 'POST', body: JSON.stringify(data) }),

  // Reports
  getReportSummary: (layoutId: string, date: string) =>
    request<any>(`/reports/summary?layoutId=${layoutId}&date=${date}`),
  getReportByProcess: (layoutId: string, date: string) =>
    request<any[]>(`/reports/by-process?layoutId=${layoutId}&date=${date}`),
  getReportOccupation: (projectId: string, layoutId?: string) =>
    request<any[]>(`/reports/occupation?projectId=${projectId}${layoutId ? `&layoutId=${layoutId}` : ''}`),
};
