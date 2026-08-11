# Floor Manager v2 — Fork open3dFloorplan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork open3dFloorplan (Svelte) thành frontend mới `floor-manager-web/`, gỡ tính năng nhà ở, nối với backend Express/Prisma hiện có để quản lý mặt bằng sản xuất (block sản phẩm, snapshot theo ngày, timeline).

**Architecture:** SvelteKit SPA fork từ `references/open3dFloorplan`, giữ nguyên canvas 2D + 3D viewer + undo/redo. Persistence chuyển từ localStorage sang REST (`http://localhost:4000/api`). Đơn vị: editor dùng **cm**, backend dùng **mét** — quy đổi ở tầng mapping. Auto-save và nút "Lưu Snapshot" đều upsert snapshot của ngày hôm nay qua `POST /api/snapshots` (không thêm endpoint mới).

**Tech Stack:** Svelte 5, SvelteKit 2, Tailwind 4, Three.js, Vite 7. Backend giữ nguyên: Express 5, Prisma 7, PostgreSQL.

**Chiến lược strip:** 2 giai đoạn — Phase 2 chỉ **ẩn** tool nhà ở khỏi UI (ít rủi ro compile), Phase 7 mới **xóa** code chết. Không TDD từng dòng (fork UI không có test runner sẵn); verification = `npm run check` (svelte-check) + dev server + screenshot headless Chrome.

**Backend API có sẵn (đã xác minh):**
- `GET /api/projects` (kèm `_count.layouts/products`), `GET/POST/PUT/DELETE /api/projects/:id`
- `GET /api/products?projectId=` , `POST/PUT/DELETE /api/products/:id` — fields: `name, code, weightKg, areaM2, processStage, category, color, file2dUrl, file3dUrl, metadata`
- `GET /api/layouts?projectId=` , `GET /api/layouts/:id` (kèm 10 snapshots gần nhất), `POST/PUT/DELETE` — fields: `name, widthM, heightM, backgroundFile, gridSize`
- `GET /api/snapshots?layoutId=` ; `GET /api/snapshots/:id` (kèm positions+product); `POST /api/snapshots` upsert theo `{layoutId, date}` với mảng `positions[{productId,x,y,rotation,scale}]` (xóa hết positions cũ rồi tạo lại)
- `GET /api/reports/...` (đọc `server/routes/reports.ts` khi làm Task 15)

---

## Phase 1: Fork chạy được

### Task 1: Copy source và chạy dev server

**Files:**
- Create: `floor-manager-web/` (copy từ `references/open3dFloorplan/`)

- [ ] **Step 1: Copy loại trừ rác**

```powershell
robocopy D:\Home\3d_planer\references\open3dFloorplan D:\Home\3d_planer\floor-manager-web /E /XD node_modules .git .svelte-kit /XF package-lock.json
```

- [ ] **Step 2: Xóa file không cần** (ảnh demo, báo cáo QA, test scratch, firebase config):

```powershell
Remove-Item D:\Home\3d_planer\floor-manager-web\* -Include *.jpg,*.png,BUG_REPORT.md,COMPARISON_REVIEW.md,FEATURE_REVIEW.md,QA_REPORT_v2.md,QA_RESULTS.md,OUTDOOR_BUGS.md,OUTDOOR_FEATURES.md,MODEL_SOURCES.md,test-*.ts,test-roomplan.json,.firebaserc,firebase.json,apphosting.yaml,storage.rules -Confirm:$false
```

- [ ] **Step 3: Sửa `package.json`**: đổi `"name": "floor-manager-web"`, xóa dependency `firebase`.

- [ ] **Step 4: `npm install`** trong `floor-manager-web/`. Expected: thành công, không cần firebase.

- [ ] **Step 5: Chạy `npm run dev`**, mở `http://localhost:5173`. Expected: landing page hiện, editor mở được (Firebase import sẽ lỗi console — sửa ở Task 2, chỉ cần app render).

- [ ] **Step 6: Commit** `feat: fork open3dFloorplan vao floor-manager-web`

### Task 2: Gỡ Firebase + RoomPlan import

**Files:**
- Delete: `floor-manager-web/src/lib/firebase.ts`
- Modify: `floor-manager-web/src/routes/+layout.svelte` (bỏ lazy-load firebase)
- Modify: `floor-manager-web/src/routes/editor/+page.svelte` (bỏ flow import RoomPlan capture từ firebasestorage URL)

- [ ] **Step 1: Tìm mọi usage**: `grep -ri "firebase\|roomplan" floor-manager-web/src --include=*.ts --include=*.svelte -l`
- [ ] **Step 2: Xóa `firebase.ts`**, gỡ import + code liên quan trong 2 file trên. RoomPlan: xóa cả `src/lib/utils/roomplanImport.ts` nếu không còn nơi nào import.
- [ ] **Step 3: Verify**: `npm run check` không lỗi mới; dev server chạy, console sạch lỗi firebase.
- [ ] **Step 4: Commit** `feat: go firebase va roomplan import`

---

## Phase 2: Ẩn tính năng nhà ở khỏi UI

### Task 3: BuildPanel — chỉ giữ Select/Pan + danh sách sản phẩm

**Files:**
- Modify: `floor-manager-web/src/lib/components/sidebar/BuildPanel.svelte`

- [ ] **Step 1:** Đọc BuildPanel, xác định các tool/tab: wall, door, window, stairs, column, entourage, room, text, guide, furniture.
- [ ] **Step 2:** Ẩn (xóa markup, giữ code phía dưới): wall/door/window/stairs/column/entourage/room. **Giữ:** select, pan, furniture (sẽ thành danh sách sản phẩm), text/annotation, guide, measurement.
- [ ] **Step 3:** Verify dev server: panel trái chỉ còn tool giữ lại; kéo thả 1 furniture bất kỳ vẫn hoạt động.
- [ ] **Step 4: Commit** `feat: an tool nha o khoi BuildPanel`

### Task 4: TopBar + LayersPanel + PropertiesPanel — dọn UI

**Files:**
- Modify: `floor-manager-web/src/lib/components/toolbar/TopBar.svelte` (bỏ nút Elevation view, version history, AI nếu có)
- Modify: `floor-manager-web/src/lib/components/sidebar/LayersPanel.svelte` (bỏ toggle walls/doors/windows/stairs/columns/entourage/rooms)
- Modify: `floor-manager-web/src/lib/components/sidebar/PropertiesPanel.svelte` (bỏ section wall/door/window/room; giữ furniture)

- [ ] **Step 1:** Sửa 3 file, mỗi file xong chạy `npm run check`.
- [ ] **Step 2:** Verify bằng screenshot headless (đã có pattern Chrome headless trong repo workflow): 2D editor + 3D view render sạch.
- [ ] **Step 3: Commit** `feat: don UI - bo muc nha o khoi toolbar va panels`

---

## Phase 3: Product catalog từ API

### Task 5: API client

**Files:**
- Create: `floor-manager-web/src/lib/services/api.ts`

- [ ] **Step 1:** Tạo file với nội dung:

```typescript
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
	id: string; name: string; description: string | null;
	createdAt: string; updatedAt: string;
	_count?: { layouts: number; products: number };
}
export interface ApiProduct {
	id: string; projectId: string; name: string; code: string;
	weightKg: number | null; areaM2: number | null;
	processStage: string | null; category: string; color: string;
	file2dUrl: string | null; file3dUrl: string | null;
	metadata: { widthM?: number; depthM?: number; heightM?: number } | null;
}
export interface ApiLayout {
	id: string; projectId: string; name: string;
	widthM: number; heightM: number;
	backgroundFile: string | null; gridSize: number;
	snapshots?: ApiSnapshot[];
}
export interface ApiPosition {
	id: string; snapshotId: string; productId: string;
	x: number; y: number; rotation: number; scale: number;
	product?: ApiProduct;
}
export interface ApiSnapshot {
	id: string; layoutId: string; date: string; note: string | null;
	positions?: ApiPosition[];
}

export const api = {
	projects: {
		list: () => http<ApiProject[]>('/projects'),
		get: (id: string) => http<ApiProject & { layouts: ApiLayout[]; products: ApiProduct[] }>(`/projects/${id}`),
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
		create: (data: { projectId: string; name: string; widthM: number; heightM: number; gridSize?: number }) =>
			http<ApiLayout>('/layouts', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: Partial<ApiLayout>) =>
			http<ApiLayout>(`/layouts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/layouts/${id}`, { method: 'DELETE' }),
	},
	snapshots: {
		list: (layoutId: string) => http<ApiSnapshot[]>(`/snapshots?layoutId=${layoutId}`),
		get: (id: string) => http<ApiSnapshot>(`/snapshots/${id}`),
		save: (data: {
			layoutId: string; date: string; note?: string;
			positions: { productId: string; x: number; y: number; rotation?: number; scale?: number }[];
		}) => http<ApiSnapshot>('/snapshots', { method: 'POST', body: JSON.stringify(data) }),
	},
};
```

- [ ] **Step 2:** `npm run check` sạch. Commit `feat: them REST api client`

### Task 6: Catalog sản phẩm động (thay furnitureCatalog tĩnh)

**Files:**
- Create: `floor-manager-web/src/lib/stores/productCatalog.ts`
- Modify: `floor-manager-web/src/lib/components/sidebar/BuildPanel.svelte` (render từ store mới)

- [ ] **Step 1:** Tạo store map `ApiProduct` → shape `FurnitureDef` mà canvas đã hiểu:

```typescript
import { writable } from 'svelte/store';
import { api, type ApiProduct } from '../services/api';
import type { FurnitureDef } from '../utils/furnitureCatalog';

// Block san pham: kich thuoc cm cho editor. Uu tien metadata (m), fallback can bac 2 cua areaM2.
export function productToDef(p: ApiProduct): FurnitureDef {
	const wM = p.metadata?.widthM ?? (p.areaM2 ? Math.sqrt(p.areaM2) : 2);
	const dM = p.metadata?.depthM ?? (p.areaM2 ? p.areaM2 / wM : 2);
	const hM = p.metadata?.heightM ?? 1;
	return {
		id: p.id,
		name: `${p.name} (${p.code})`,
		category: p.category === 'thiet_bi' ? 'Thiết bị' : 'Sản phẩm',
		icon: '📦',
		color: p.color,
		width: Math.round(wM * 100),
		depth: Math.round(dM * 100),
		height: Math.round(hM * 100),
	};
}

export const productCatalog = writable<FurnitureDef[]>([]);
export const productsById = writable<Map<string, ApiProduct>>(new Map());

export async function loadProductCatalog(projectId: string) {
	const products = await api.products.list(projectId);
	productCatalog.set(products.map(productToDef));
	productsById.set(new Map(products.map((p) => [p.id, p])));
}
```

- [ ] **Step 2:** BuildPanel: thay nguồn danh sách furniture bằng `$productCatalog` (giữ nguyên cơ chế drag-to-canvas dùng `catalogId`). Mọi chỗ tra cứu `furnitureCatalog.find(...)` trong canvas/3D cần fallback: nếu không thấy trong catalog tĩnh thì tra `$productCatalog` — tìm bằng `grep -rn "furnitureCatalog" src/` và thêm helper `resolveDef(catalogId)` dùng chung.
- [ ] **Step 3:** 3D model: trong `furnitureModels3d.ts`, thêm nhánh default khi `catalogId` không khớp item có sẵn → `BoxGeometry(width, height, depth)` + `MeshStandardMaterial({ color: def.color })`.
- [ ] **Step 4:** Verify: seed 2 product qua API (curl/PowerShell `Invoke-RestMethod`), mở editor, panel trái hiện 2 block, kéo vào canvas, xoay/scale, chuyển 3D thấy hình hộp đúng màu.
- [ ] **Step 5: Commit** `feat: catalog san pham dong tu API + block 3D generic`

---

## Phase 4: Persistence sang REST

### Task 7: Mapping Layout↔Floor + quy đổi đơn vị

**Files:**
- Create: `floor-manager-web/src/lib/services/mapping.ts`

- [ ] **Step 1:** Tạo module (điều chỉnh field khớp `types.ts` thực tế khi làm — đọc `models/types.ts` trước):

```typescript
import type { Floor, FurnitureItem, Project } from '../models/types';
import type { ApiLayout, ApiPosition, ApiSnapshot } from './api';

export const M_TO_CM = 100;

// Position (met, backend) -> FurnitureItem (cm, editor)
export function positionToItem(p: ApiPosition): FurnitureItem {
	return {
		id: p.productId, // 1 product = 1 block tren layout (unique theo snapshot)
		catalogId: p.productId,
		position: { x: p.x * M_TO_CM, y: p.y * M_TO_CM },
		rotation: p.rotation,
		scale: p.scale,
	} as FurnitureItem;
}

export function itemToPosition(it: FurnitureItem) {
	return {
		productId: it.catalogId,
		x: it.position.x / M_TO_CM,
		y: it.position.y / M_TO_CM,
		rotation: it.rotation ?? 0,
		scale: it.scale ?? 1,
	};
}

// Layout + snapshot -> Project/Floor structure cua editor
export function layoutToProject(layout: ApiLayout, snapshot: ApiSnapshot | null): Project {
	const floor: Floor = {
		id: layout.id,
		name: layout.name,
		level: 0,
		walls: [], rooms: [], doors: [], windows: [],
		stairs: [], columns: [], guides: [], measurements: [],
		annotations: [], textAnnotations: [], groups: [], entourage: [],
		furniture: (snapshot?.positions ?? []).map(positionToItem),
	} as Floor;
	return {
		id: layout.id,
		name: layout.name,
		floors: [floor],
		activeFloorId: floor.id,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	} as Project;
}
```

- [ ] **Step 2:** `npm run check` sạch. Commit `feat: mapping layout-snapshot sang model editor`

### Task 8: Datastore REST + luồng load editor

**Files:**
- Modify: `floor-manager-web/src/lib/services/datastore.ts` (thêm `backendStore` cùng interface `DataStore`)
- Modify: `floor-manager-web/src/routes/editor/+page.svelte` (load theo `?layoutId=` từ API thay vì localStorage)
- Modify: `floor-manager-web/src/lib/stores/saveStatus.ts` (auto-save gọi backendStore)

- [ ] **Step 1:** `backendStore.load(layoutId)`: gọi `api.layouts.get` + `api.snapshots.list` → lấy snapshot mới nhất → `layoutToProject`. Đồng thời `loadProductCatalog(layout.projectId)`.
- [ ] **Step 2:** `backendStore.save(project)`: map furniture của floor hiện tại qua `itemToPosition`, gọi `api.snapshots.save({ layoutId, date: hômNay(yyyy-MM-dd), positions })`.
- [ ] **Step 3:** editor `+page.svelte`: đọc `layoutId` từ query param; nếu thiếu → redirect `/`. Xóa nhánh localStorage.
- [ ] **Step 4:** Verify end-to-end: chạy backend (`npm run server` trong `floor-manager/`) + seed 1 project/layout/2 products; mở `/editor?layoutId=...`; kéo block, đợi auto-save 5s; `Invoke-RestMethod http://localhost:4000/api/snapshots?layoutId=...` thấy positions đúng (đơn vị mét).
- [ ] **Step 5: Commit** `feat: persistence qua REST backend`

---

## Phase 5: Snapshot theo ngày + Timeline

### Task 9: Timeline bar

**Files:**
- Create: `floor-manager-web/src/lib/components/editor/TimelineBar.svelte`
- Modify: `floor-manager-web/src/routes/editor/+page.svelte` (gắn dưới canvas)

- [ ] **Step 1:** Component: load `api.snapshots.list(layoutId)`, render dãy pill ngày (dd/MM) + pill "Hôm nay". Click ngày cũ → load positions snapshot đó vào editor ở chế độ **read-only** (khóa mutation: set store `timelineReadonly`, canvas bỏ qua drag khi true) + banner "Đang xem 05/08 — Quay về hôm nay". Click "Hôm nay" → load lại snapshot hôm nay, mở khóa.
- [ ] **Step 2:** Style theo mockup: pill `bg-gray-100`, active `bg-blue-50 text-blue-700 border-blue-200`, hôm nay `bg-blue-600 text-white`.
- [ ] **Step 3:** Verify: tạo snapshot 2 ngày khác nhau (POST trực tiếp với date khác), chuyển qua lại trên timeline thấy vị trí thay đổi, không kéo được khi xem ngày cũ.
- [ ] **Step 4: Commit** `feat: timeline snapshot theo ngay`

### Task 10: Nút "Lưu Snapshot" + trạng thái lưu

**Files:**
- Modify: `floor-manager-web/src/lib/components/toolbar/TopBar.svelte`

- [ ] **Step 1:** Thêm nút "Lưu Snapshot" (primary, xanh) → gọi `backendStore.save` ngay + toast "Đã lưu snapshot 11/08". Indicator saving/saved của saveStatus giữ nguyên.
- [ ] **Step 2:** Verify + screenshot. Commit `feat: nut luu snapshot`

---

## Phase 6: Các trang ngoài editor

### Task 11: Dashboard dự án (landing page)

**Files:**
- Modify: `floor-manager-web/src/routes/+page.svelte`

- [ ] **Step 1:** Thay project list localStorage bằng `api.projects.list()`. Card: tên, mô tả, badge số sản phẩm/mặt bằng (`_count`), nút tạo/xóa (confirm). Click card → danh sách layout của project (inline expand hoặc trang `/project/[id]`) → click layout mở `/editor?layoutId=`.
- [ ] **Step 2:** Giữ style card gốc của fork (đã cùng theme). Verify + screenshot. Commit `feat: dashboard du an tu API`

### Task 12: Trang quản lý sản phẩm

**Files:**
- Create: `floor-manager-web/src/routes/products/[projectId]/+page.svelte`

- [ ] **Step 1:** Bảng sản phẩm (`api.products.list`): tên, mã, KL, DT, công đoạn (badge màu), màu block, nút sửa/xóa. Form modal tạo/sửa: name, code, weightKg, areaM2, processStage (select: Hàn/Sơn/Lắp ráp/Cắt), category (san_pham/thiet_bi), color (input color), metadata.widthM/depthM/heightM (tùy chọn).
- [ ] **Step 2:** Verify CRUD đủ 4 thao tác qua UI. Commit `feat: trang quan ly san pham`

### Task 13: Trang báo cáo

**Files:**
- Read first: `floor-manager/server/routes/reports.ts` (xem API trả gì)
- Create: `floor-manager-web/src/routes/reports/[projectId]/+page.svelte`

- [ ] **Step 1:** Đọc `reports.ts`, viết page 3 tab theo spec cũ (tổng hợp mặt bằng / theo công đoạn / m²×ngày) + 4 stat card. Nếu API thiếu báo cáo nào → tính client-side từ snapshots (chấp nhận ở giai đoạn này, ghi TODO backend vào plan khi gặp).
- [ ] **Step 2:** Nút "Xuất PDF" dùng jsPDF (đã là dependency của fork) — bảng qua autotable-style thủ công hoặc `jspdf-autotable` (thêm dep nếu cần).
- [ ] **Step 3:** Verify + screenshot. Commit `feat: trang bao cao + xuat PDF`

---

## Phase 7: Dọn dẹp

### Task 14: Xóa code chết nhà ở

**Files (xóa nếu không còn import — kiểm bằng grep trước từng file):**
- `src/lib/utils/`: houseTemplates.ts, roomTemplates.ts, roomPresets.ts, roomDetection.ts, entourageCatalog.ts, textureGenerator.ts, materials.ts, cadExport.ts, roomplanImport.ts (nếu còn)
- `src/lib/components/editor/ElevationView.svelte`, `PrintLayout.svelte`
- `src/lib/components/viewer3d/MaterialPicker.svelte`
- `src/lib/components/sidebar/AreaSummaryPanel.svelte`
- `src/lib/stores/versionHistory.ts`, `aiKeys.ts`
- `static/models/` các glb nội thất không dùng

- [ ] **Step 1:** Với từng file: `grep -rn "<tên module>" src/` → gỡ import còn sót → xóa file → `npm run check`.
- [ ] **Step 2:** Types: trong `models/types.ts` giữ Wall/Door/Window... dạng mảng rỗng (Floor vẫn tham chiếu) — chỉ xóa type nào không còn được canvas/renderer đụng tới sau khi strip. Không ép xóa nếu kéo theo sửa lớn canvasRenderer.
- [ ] **Step 3:** Verify: `npm run check` sạch, `npm run build` thành công, full flow (dashboard → editor → kéo block → save → timeline → 3D) chạy đúng.
- [ ] **Step 4: Commit** `chore: xoa code nha o khong dung`

### Task 15: Gỡ frontend React cũ

- [ ] **Step 1:** Chỉ làm sau khi Phase 4–6 chạy ổn và user xác nhận. Xóa `floor-manager/src/`, `index.html`, `vite.config.ts`, các dep React trong `floor-manager/package.json` (giữ scripts server). `floor-manager/` trở thành backend-only.
- [ ] **Step 2:** Cập nhật README gốc: mô tả cấu trúc mới (`floor-manager-web` = frontend, `floor-manager` = backend). Commit `chore: go frontend React cu`

---

## Ghi chú thực thi

- **Thứ tự bắt buộc:** Task 1→2→(3,4 song song được)→5→6→7→8→9→10→(11,12,13 song song được)→14→15.
- **Mỗi task một commit** (hoặc hơn), message tiếng Việt không dấu như ví dụ.
- **Verification chuẩn:** `npm run check` + dev server + Chrome headless screenshot (`chrome --headless=new --screenshot=... http://localhost:5173/...`).
- Backend không sửa gì ngoài đọc; nếu phát hiện thiếu API (Task 13) → ghi nhận, tính client-side trước.
- Code trong plan là khung chuẩn; khi field/type thực tế của fork khác (vd `FurnitureItem` có thêm field bắt buộc), điều chỉnh theo `models/types.ts` thực tế nhưng giữ nguyên hành vi mô tả.
