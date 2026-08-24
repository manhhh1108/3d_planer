import type { Project } from '$lib/models/types';
import { api } from './api';
import { layoutToProject, projectToPositions, projectToWalls, todayStr } from './mapping';
import { loadProductCatalog } from '$lib/stores/productCatalog';
import { externalPlacements } from '$lib/stores/project';

export interface DataStore {
  save(project: Project, date?: string): Promise<void>;
  load(id: string): Promise<Project | null>;
  list(): Promise<{ id: string; name: string; updatedAt: string }[]>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<Project | null>;
  saveThumbnail(id: string, dataUrl: string): void;
  getThumbnail(id: string): string | null;
}

const KEY = 'floorplan_projects';

function getAll(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export const localStore: DataStore = {
  async save(project, _date?) {
    const all = getAll();
    all[project.id] = JSON.stringify(project);
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e: any) {
      if (e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014) {
        console.warn('[DataStore] localStorage quota exceeded');
        // Attempt to save just this project by removing others if needed
        const minimal: Record<string, string> = {};
        minimal[project.id] = all[project.id];
        try {
          localStorage.setItem(KEY, JSON.stringify(minimal));
          alert('Storage quota exceeded. Other projects were removed to save this one. Consider exporting important projects as JSON.');
        } catch {
          alert('Storage quota exceeded. Please export your project as JSON and clear browser data.');
        }
      } else {
        throw e;
      }
    }
  },

  async load(id) {
    const all = getAll();
    const raw = all[id];
    if (!raw) return null;
    const p = JSON.parse(raw);
    p.createdAt = new Date(p.createdAt);
    p.updatedAt = new Date(p.updatedAt);
    // Migrate floors: ensure all array fields exist
    for (const floor of (p.floors ?? [])) {
      if (!floor.rooms) floor.rooms = [];
      if (!floor.doors) floor.doors = [];
      if (!floor.windows) floor.windows = [];
      if (!floor.furniture) floor.furniture = [];
      if (!floor.stairs) floor.stairs = [];
      if (!floor.columns) floor.columns = [];
    }
    return p as Project;
  },

  async list() {
    const all = getAll();
    return Object.values(all).map((raw) => {
      const p = JSON.parse(raw as string);
      return { id: p.id, name: p.name, updatedAt: p.updatedAt };
    });
  },

  async delete(id) {
    const all = getAll();
    delete all[id];
    localStorage.setItem(KEY, JSON.stringify(all));
    // Also remove thumbnail
    try { localStorage.removeItem(`floorplan_thumb_${id}`); } catch {}
  },

  async duplicate(id: string): Promise<Project | null> {
    const original = await this.load(id);
    if (!original) return null;
    const newId = Math.random().toString(36).slice(2, 10);
    const dup: Project = {
      ...original,
      id: newId,
      name: `${original.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.save(dup);
    // Copy thumbnail if exists
    try {
      const thumb = localStorage.getItem(`floorplan_thumb_${id}`);
      if (thumb) localStorage.setItem(`floorplan_thumb_${newId}`, thumb);
    } catch {}
    return dup;
  },

  saveThumbnail(id: string, dataUrl: string) {
    try { localStorage.setItem(`floorplan_thumb_${id}`, dataUrl); } catch {}
  },

  getThumbnail(id: string): string | null {
    try { return localStorage.getItem(`floorplan_thumb_${id}`); } catch { return null; }
  },
};

/**
 * Backend store: Project của editor = 1 Layout của backend (project.id == layoutId).
 * save() upsert snapshot của NGÀY HÔM NAY qua POST /api/snapshots.
 */
// Tường đổi hiếm hơn vị trí block rất nhiều. Nhớ payload đã gửi để autosave
// (chạy sau mỗi thay đổi, debounce 2s) không PUT lại y hệt mỗi lần kéo block.
let lastWallsSent: { layoutId: string; json: string } | null = null;

// Snapshot vừa lưu — ảnh xem trước gắn vào đúng nó. saveThumbnail() chỉ nhận
// layoutId nên phải nhớ lại từ lần save gần nhất.
let lastSnapshotId: string | null = null;

/** data URL -> Blob, để gửi ảnh dạng nhị phân thay vì base64 phình 33% */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const mime = /data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/jpeg';
  try {
    const bin = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

export const backendStore: DataStore = {
  async save(project, date?) {
    const snapshot = await api.snapshots.save({
      layoutId: project.id,
      date: date ?? todayStr(),
      positions: projectToPositions(project),
    });
    lastSnapshotId = snapshot.id;

    const walls = projectToWalls(project);
    const json = JSON.stringify(walls);
    if (lastWallsSent?.layoutId !== project.id || lastWallsSent.json !== json) {
      await api.layouts.saveWalls(project.id, walls);
      lastWallsSent = { layoutId: project.id, json };
    }
  },

  async load(layoutId) {
    const layout = await api.layouts.get(layoutId);
    if (!layout) return null;
    // Catalog sản phẩm phải sẵn sàng trước khi canvas render các block
    await loadProductCatalog();
    const snapshots = await api.snapshots.list(layoutId);
    const latest = snapshots[0] ? await api.snapshots.get(snapshots[0].id) : null;
    // Bản đang bị chiếm ở mặt bằng khác — nạp trước khi canvas render, để badge
    // số lượng không nhấp nháy từ "còn" sang "hết".
    try {
      const usage = await api.products.usage(layoutId);
      externalPlacements.set(new Map(usage.map((u) => [u.productId, { count: u.count, layouts: u.layouts }])));
    } catch {
      externalPlacements.set(new Map()); // thiếu dữ liệu thì đừng chặn oan
    }

    const project = layoutToProject(layout, latest);
    // Mồi bộ nhớ đệm bằng đúng thứ backend đang giữ, để lần save đầu tiên sau
    // khi mở layout không gửi lại nguyên si những gì vừa tải về.
    lastWallsSent = { layoutId, json: JSON.stringify(projectToWalls(project)) };
    return project;
  },

  async list() {
    return []; // danh sách layout xem ở Dashboard (theo project), không dùng ở đây
  },

  async delete(layoutId) {
    await api.layouts.remove(layoutId);
  },

  async duplicate() {
    return null; // chưa hỗ trợ nhân bản layout từ editor
  },

  saveThumbnail(_id: string, dataUrl: string) {
    if (!lastSnapshotId) return; // chưa lưu lần nào thì chưa có snapshot để gắn
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return;
    // Ảnh xem trước chỉ là trang trí — hỏng thì im lặng, tuyệt đối không được
    // làm hỏng luồng lưu dữ liệu thật.
    api.snapshots.uploadThumbnail(lastSnapshotId, blob).catch(() => {});
  },

  getThumbnail(): string | null {
    return null; // ảnh nằm ở backend, trang mặt bằng đọc trực tiếp từ snapshot
  },
};

/** Store đang hoạt động: editor đặt backendStore khi mở qua ?layoutId= */
let activeStore: DataStore = localStore;
export function setActiveStore(store: DataStore) {
  activeStore = store;
}
export function getActiveStore(): DataStore {
  return activeStore;
}
