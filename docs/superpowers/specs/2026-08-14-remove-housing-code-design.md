# Remove Housing Code — Design Spec

**Date:** 2026-08-14  
**Goal:** Xóa toàn bộ code vẽ và tương tác nhà ở (walls, doors, windows, stairs, columns, rooms, entourage) khỏi canvas renderer và FloorPlanCanvas, sau đó xóa 6 utils không còn cần thiết.

---

## Phạm vi

### Xóa hoàn toàn
| File | Lý do |
|------|-------|
| `src/lib/utils/cadExport.ts` | Export DXF/DWG kiến trúc, không dùng trong factory app |
| `src/lib/utils/roomPresets.ts` | Template phòng nhà ở |
| `src/lib/utils/entourageCatalog.ts` | Ký hiệu người/xe/cây — không cần trong nhà máy |
| `src/lib/utils/roomDetection.ts` | Phát hiện phòng từ tường |
| `src/lib/utils/materials.ts` | Vật liệu tường/sàn kiến trúc |
| `src/lib/utils/textureGenerator.ts` | Texture procedural tường/sàn |

### Giữ nguyên
- **`src/lib/models/types.ts`** — Kiểu `Wall`, `Door`, `Window`, `Room`, `Stair`, `Column` và các field trong `Floor` giữ nguyên (luôn là mảng rỗng, không cần refactor type). Chỉ xóa code runtime, không xóa type definitions.
- **`src/lib/utils/furnitureCatalog.ts`** — Không có code nhà ở, giữ nguyên.
- **`src/lib/utils/canvasRenderer.ts`** — Giữ các hàm: `drawFurnitureItem`, `drawMinimap`, `drawGrid`, `drawGuides`, `drawPersistedMeasurements`, `drawTextAnnotations`, `drawAnnotation`, `drawAnnotations`. Xóa các hàm housing + entourage.
- **`src/lib/components/editor/FloorPlanCanvas.svelte`** — Giữ furniture placement/drag/rotate/scale, measurement tool, text annotation, pan/zoom, minimap, undo/redo. Xóa tất cả tool state và handler cho wall/door/window/stair/column/room/entourage.
- **`src/lib/components/viewer3d/ThreeViewer.svelte`** — Xóa chỉ những import và call liên quan đến utils bị xóa.

---

## Các file bị ảnh hưởng (consumers cần sửa)

| Consumer | Utils cần gỡ |
|----------|-------------|
| `src/lib/components/toolbar/TopBar.svelte` | cadExport |
| `src/lib/components/editor/CommandPalette.svelte` | cadExport |
| `src/lib/components/editor/FloorPlanCanvas.svelte` | roomPresets, entourageCatalog, roomDetection, materials, textureGenerator + housing functions từ canvasRenderer |
| `src/lib/components/sidebar/PropertiesPanel.svelte` | entourageCatalog, materials |
| `src/lib/components/viewer3d/ThreeViewer.svelte` | roomDetection, materials, textureGenerator |
| `src/lib/utils/canvasRenderer.ts` | entourageCatalog, roomDetection, materials, textureGenerator (import và các hàm dùng chúng) |

---

## Thứ tự xóa (5 bước, file-by-file)

### Bước 1 — `cadExport.ts`
**Consumers:** TopBar.svelte, CommandPalette.svelte  
**Việc làm:**
- Xóa import `exportDXF`, `exportDWG` trong TopBar.svelte
- Xóa nút Export DXF/DWG trong TopBar template
- Xóa import và command entry trong CommandPalette.svelte
- Xóa `cadExport.ts`

**Commit:** `chore: remove DXF/DWG export and cadExport util`

---

### Bước 2 — `roomPresets.ts`
**Consumers:** FloorPlanCanvas.svelte only  
**Việc làm:**
- Tìm `roomPresets`, `placePreset` trong FloorPlanCanvas.svelte
- Xóa import, state variable cho preset tool, handler `placePreset`, và markup preset picker (nếu có trong template)
- Xóa `roomPresets.ts`

**Commit:** `chore: remove room presets tool and util`

---

### Bước 3 — `entourageCatalog.ts`
**Consumers:** canvasRenderer.ts, FloorPlanCanvas.svelte, PropertiesPanel.svelte  
**Việc làm:**
- Trong **canvasRenderer.ts**: xóa import `getEntourageDef` → xóa 3 hàm `drawEntourageItems`, `drawEntourageGhost`, `entourageAspect`
- Trong **FloorPlanCanvas.svelte**: xóa import các hàm entourage từ canvasRenderer, xóa import `getEntourageDef` từ entourageCatalog, xóa toàn bộ entourage tool state + event handlers + render calls
- Trong **PropertiesPanel.svelte**: xóa import `getEntourageDef`, xóa section thuộc tính entourage
- Xóa `entourageCatalog.ts`

**Commit:** `chore: remove entourage rendering and catalog`

---

### Bước 4 — Housing core (bước lớn, 1 commit)
**Xóa đồng thời:** `roomDetection.ts`, `materials.ts`, `textureGenerator.ts`  
**Consumers:** canvasRenderer.ts, FloorPlanCanvas.svelte, ThreeViewer.svelte

**Việc làm trong canvasRenderer.ts:**
- Xóa imports: `detectRooms`, `getRoomPolygon`, `roomCentroid`, `getMaterial`, `getWallColor`, `getWallTextureCanvas`, `getFloorTextureCanvas`, `setTextureLoadCallback`
- Xóa các hàm: `drawWall`, `drawDoorOnWall`, `drawWindowOnWall`, `drawDoorDistanceDimensions`, `drawWindowDistanceDimensions`, `drawStair`, `drawColumn`, `drawRooms`, `drawRoomFloorPattern`, `getRoomFill`, `drawWallJoints`, `drawSnapPoints`, `wallLength`, `wallPointAt`, `wallTangentAt`, `wallEdgeInsets`

**Việc làm trong FloorPlanCanvas.svelte:**
- Xóa imports các hàm housing từ canvasRenderer
- Xóa imports từ roomDetection, materials, textureGenerator
- Xóa tool states: `wallTool`, `doorTool`, `windowTool`, `stairTool`, `columnTool`, `roomTool`, `activeTool` housing modes
- Xóa event handlers (mousedown/mousemove/mouseup cho các tool trên)
- Xóa render calls trong render loop: `_drawWall`, `_drawDoorOnWall`, `_drawWindowOnWall`, v.v.
- Xóa room detection state và subscription

**Việc làm trong ThreeViewer.svelte:**
- Xóa imports từ roomDetection, materials, textureGenerator
- Xóa các usage trong scene setup (wall mesh generation, floor material assignment, room polygon extrusion)

**Sau đó:** Xóa 3 file utils.

**Commit:** `chore: remove housing rendering — walls, doors, windows, stairs, columns, rooms`

---

### Bước 5 — Final cleanup
**Việc làm:**
- Chạy `npm run check` — fix mọi lỗi type còn sót (import thừa, variable không dùng)
- Chạy `npm run build` — xác nhận build production thành công
- Kiểm tra runtime: dev server chạy, furniture drag vào canvas hoạt động, 3D view hiện, timeline hoạt động

**Commit:** `chore: final housing code cleanup — build and check pass`

---

## Không làm trong scope này
- Không xóa type `Wall`, `Door`, `Window`, `Room`, `Stair`, `Column` khỏi `models/types.ts`
- Không sửa backend
- Không xóa `PrintLayout.svelte` (vẫn được dùng trong editor)
- Không thay đổi furniture rendering, 3D furniture loader, snapshot, timeline

---

## Tiêu chí hoàn thành
- `npm run check`: 0 errors (warnings a11y hiện có không tính)
- `npm run build`: thành công
- Không còn import nào trong codebase trỏ đến 6 utils đã xóa
- Furniture drag + 3D viewer + timeline chạy đúng trong dev server
