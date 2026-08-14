# Remove Housing Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xóa toàn bộ code vẽ và tương tác nhà ở (walls, doors, windows, stairs, columns, rooms, entourage) khỏi floor-manager-web; xóa 6 utils không còn cần thiết.

**Architecture:** File-by-file, mỗi task xóa 1 util và toàn bộ callers của nó — check pass sau mỗi task. Giữ nguyên types trong `models/types.ts` và toàn bộ furniture/annotation/measurement code.

**Tech Stack:** Svelte 5, TypeScript, `npm run check` (svelte-check), `npm run build` (Vite).  
Tất cả lệnh chạy từ `floor-manager-web/`.

---

## File Structure (thay đổi)

| File | Thao tác |
|------|----------|
| `src/lib/utils/cadExport.ts` | Xóa hoàn toàn |
| `src/lib/utils/roomPresets.ts` | Xóa hoàn toàn |
| `src/lib/utils/entourageCatalog.ts` | Xóa hoàn toàn |
| `src/lib/utils/roomDetection.ts` | Xóa hoàn toàn |
| `src/lib/utils/materials.ts` | Xóa hoàn toàn |
| `src/lib/utils/textureGenerator.ts` | Xóa hoàn toàn |
| `src/lib/components/toolbar/TopBar.svelte` | Xóa import + 2 handler + 2 button |
| `src/lib/components/editor/CommandPalette.svelte` | Xóa import + 1 command + 3 tool entries |
| `src/lib/utils/canvasRenderer.ts` | Xóa 19 housing/entourage functions + 3 import lines |
| `src/lib/components/editor/FloorPlanCanvas.svelte` | Xóa housing imports, render calls, interaction code |
| `src/lib/components/sidebar/PropertiesPanel.svelte` | Xóa entourage import + 1 usage |
| `src/lib/components/viewer3d/ThreeViewer.svelte` | Xóa housing imports + wall/room rendering sections |

---

## Task 1: Xóa cadExport.ts

**Files:**
- Modify: `src/lib/components/toolbar/TopBar.svelte`
- Modify: `src/lib/components/editor/CommandPalette.svelte`
- Delete: `src/lib/utils/cadExport.ts`

- [ ] **Step 1: Xóa import cadExport trong TopBar.svelte**

Tìm và xóa dòng 9:
```
import { exportDXF, exportDWG } from '$lib/utils/cadExport';
```

- [ ] **Step 2: Xóa 2 handler functions trong TopBar.svelte**

Tìm và xóa khối lines 113–123:
```typescript
  function onExportDXF() {
    const p = get(currentProject);
    if (p) exportDXF(p);
    exportOpen = false;
  }

  function onExportDWG() {
    const p = get(currentProject);
    if (p) exportDWG(p);
    exportOpen = false;
  }
```

- [ ] **Step 3: Xóa 2 button trong TopBar.svelte template**

Tìm và xóa 2 button lines 412–419:
```svelte
        <button class="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left flex items-center gap-2" onclick={onExportDXF}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 16h2"/><path d="M14 16h2"/></svg>
          Export as DXF
        </button>
        <button class="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left flex items-center gap-2" onclick={onExportDWG}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 16h6"/></svg>
          Export as DWG
        </button>
```

- [ ] **Step 4: Xóa import + command trong CommandPalette.svelte**

Xóa dòng 5:
```typescript
  import { exportDXF } from '$lib/utils/cadExport';
```

Xóa dòng 40 (entry `a-export-dxf` trong mảng `actions`):
```typescript
    { id: 'a-export-dxf', name: 'Export DXF', icon: '⚡', category: 'action', categoryLabel: '⚡ Action', action: () => { const p = get(currentProject); if (p) exportDXF(p); } },
```

- [ ] **Step 5: Xóa 3 tool entries nhà ở trong CommandPalette.svelte**

Xóa lines 31–34 (wall/door/window tool entries trong mảng `tools`):
```typescript
    { id: 't-wall', name: 'Wall Tool', icon: '🔧', category: 'tool', categoryLabel: '🔧 Tool', action: () => selectedTool.set('wall') },
    { id: 't-door', name: 'Door Tool', icon: '🔧', category: 'tool', categoryLabel: '🔧 Tool', action: () => selectedTool.set('door') },
    { id: 't-window', name: 'Window Tool', icon: '🔧', category: 'tool', categoryLabel: '🔧 Tool', action: () => selectedTool.set('window') },
```

- [ ] **Step 6: Xóa file cadExport.ts**

```powershell
Remove-Item src/lib/utils/cadExport.ts
```

- [ ] **Step 7: Chạy check**

```powershell
npm run check
```

Expected: 0 errors. Nếu có lỗi `get` không dùng trong TopBar sau khi xóa handlers — kiểm tra `get` có còn được dùng ở chỗ khác trong file không trước khi xóa import.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/components/toolbar/TopBar.svelte src/lib/components/editor/CommandPalette.svelte src/lib/utils/cadExport.ts
git commit -m "chore: remove DXF/DWG export and cadExport util"
```

---

## Task 2: Xóa roomPresets.ts

**Files:**
- Modify: `src/lib/components/editor/FloorPlanCanvas.svelte`
- Delete: `src/lib/utils/roomPresets.ts`

- [ ] **Step 1: Xóa import roomPresets trong FloorPlanCanvas.svelte**

Xóa dòng 12:
```typescript
  import { roomPresets, placePreset } from '$lib/utils/roomPresets';
```

- [ ] **Step 2: Xóa usage roomPresets trong FloorPlanCanvas.svelte**

Tìm và xóa khối lines 3449–3455 (nhánh `itemType === 'room'` trong hàm đặt item từ palette):
```typescript
    } else if (itemType === 'room') {
      const preset = roomPresets.find(p => p.id === itemId);
      if (preset) {
        placePreset(preset, pos);
        selectedTool.set('select');
      }
    }
```

Thay bằng (chỉ đóng block nếu cần, hoặc xóa toàn bộ nhánh):
```typescript
    }
```

- [ ] **Step 3: Xóa file roomPresets.ts**

```powershell
Remove-Item src/lib/utils/roomPresets.ts
```

- [ ] **Step 4: Chạy check**

```powershell
npm run check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/utils/roomPresets.ts src/lib/components/editor/FloorPlanCanvas.svelte
git commit -m "chore: remove room presets tool and util"
```

---

## Task 3: Xóa entourageCatalog.ts

**Files:**
- Modify: `src/lib/utils/canvasRenderer.ts`
- Modify: `src/lib/components/editor/FloorPlanCanvas.svelte`
- Modify: `src/lib/components/sidebar/PropertiesPanel.svelte`
- Delete: `src/lib/utils/entourageCatalog.ts`

- [ ] **Step 1: Xóa import getEntourageDef trong canvasRenderer.ts**

Xóa dòng 15:
```typescript
import { getEntourageDef } from '$lib/utils/entourageCatalog';
```

Xóa dòng 16 (type imports cho entourage — không cần nếu không còn dùng):
```typescript
import type { EntourageItem, CustomEntourageDef } from '$lib/models/types';
```

Kiểm tra: nếu `EntourageItem` hoặc `CustomEntourageDef` còn dùng trong các function sẽ XÓA ở bước sau, thì bước này có thể để lại — TypeScript sẽ báo sau khi xóa functions.

- [ ] **Step 2: Xóa 3 entourage functions trong canvasRenderer.ts**

Xóa hàm `entourageAspect` (lines 1689–1692):
```typescript
export function entourageAspect(defId: string, customDefs?: CustomEntourageDef[]): number {
  // ... (~4 lines)
}
```

Xóa hàm `drawEntourageItems` (lines 1761–1773):
```typescript
export function drawEntourageItems(cs: CanvasState, floor: Floor, currentSelectedId: string | null, customEntourageDefs?: CustomEntourageDef[], onDirty?: () => void): void {
  // ... (~13 lines)
}
```

Xóa hàm `drawEntourageGhost` (lines 1774–1791):
```typescript
export function drawEntourageGhost(cs: CanvasState, defId: string, customDefs: CustomEntourageDef[] | undefined, pos: Point, width: number): void {
  // ... (~18 lines)
}
```

Để xác định chính xác boundary của mỗi hàm, tìm `export function entourageAspect` và đếm đến closing `}` khớp.

- [ ] **Step 3: Cập nhật import canvasRenderer trong FloorPlanCanvas.svelte**

Hiện tại dòng 17 import có:
```typescript
  import { drawWall as _drawWall, drawDoorOnWall as _drawDoorOnWall, drawWindowOnWall as _drawWindowOnWall, drawDoorDistanceDimensions as _drawDoorDistanceDimensions, drawWindowDistanceDimensions as _drawWindowDistanceDimensions, drawFurnitureItem, drawStair as _drawStair, drawColumn as _drawColumn, drawGuides as _drawGuides, drawPersistedMeasurements as _drawPersistedMeasurements, drawTextAnnotations as _drawTextAnnotations, drawAnnotation as _drawAnnotation, drawAnnotations as _drawAnnotations, drawRooms as _drawRooms, drawWallJoints as _drawWallJoints, drawSnapPoints as _drawSnapPoints, drawMinimap as _drawMinimap, drawEntourageItems as _drawEntourageItems, drawEntourageGhost as _drawEntourageGhost, entourageAspect } from '$lib/utils/canvasRenderer';
```

Xóa các phần entourage khỏi import này (`drawEntourageItems as _drawEntourageItems`, `drawEntourageGhost as _drawEntourageGhost`, `entourageAspect`). Kết quả:
```typescript
  import { drawWall as _drawWall, drawDoorOnWall as _drawDoorOnWall, drawWindowOnWall as _drawWindowOnWall, drawDoorDistanceDimensions as _drawDoorDistanceDimensions, drawWindowDistanceDimensions as _drawWindowDistanceDimensions, drawFurnitureItem, drawStair as _drawStair, drawColumn as _drawColumn, drawGuides as _drawGuides, drawPersistedMeasurements as _drawPersistedMeasurements, drawTextAnnotations as _drawTextAnnotations, drawAnnotation as _drawAnnotation, drawAnnotations as _drawAnnotations, drawRooms as _drawRooms, drawWallJoints as _drawWallJoints, drawSnapPoints as _drawSnapPoints, drawMinimap as _drawMinimap } from '$lib/utils/canvasRenderer';
```

- [ ] **Step 4: Xóa import entourageCatalog trong FloorPlanCanvas.svelte**

Xóa dòng 18:
```typescript
  import { getEntourageDef } from '$lib/utils/entourageCatalog';
```

- [ ] **Step 5: Xóa entourage render calls trong FloorPlanCanvas.svelte**

Tìm và xóa dòng 1199 (entourage render trong draw loop):
```typescript
      _drawEntourageItems(getCS(), floor, currentSelectedId, customEntourageDefs, markDirty);
```

Tìm và xóa dòng 1446 (entourage ghost khi placing):
```typescript
      _drawEntourageGhost(getCS(), currentEntourageDefId, customEntourageDefs, mousePos, ghostW);
```

Tìm và xóa các dòng dùng `entourageAspect` (lines 2364, 2400, 2739 và context bao quanh). Dùng grep để xác nhận:
```powershell
Select-String -Path src/lib/components/editor/FloorPlanCanvas.svelte -Pattern "entourageAspect|_drawEntourage|currentEntourageDefId|customEntourageDefs|placingEntourageId|addEntourageItem|moveEntourage|resizeEntourage|findEntourageAt"
```

Xóa tất cả dòng liên quan đến entourage trong interaction code (event handlers, state variables). Các patterns để tìm:
- `placingEntourageId` — state/store cho loại entourage đang đặt
- `addEntourageItem` — action thêm entourage vào floor
- `moveEntourage`, `resizeEntourage` — action di chuyển/resize
- `findEntourageAt` — hit-test entourage
- `customEntourageDefs` — prop/state custom entourage
- `currentEntourageDefId` — state biến đang placing

- [ ] **Step 6: Xóa entourage trong store import (dòng 3 FloorPlanCanvas.svelte)**

Dòng 3 import từ `$lib/stores/project` chứa nhiều stores. Xóa các tên liên quan entourage:
`placingEntourageId`, `addEntourageItem`, `moveEntourage`, `resizeEntourage`

- [ ] **Step 7: Xóa entourage trong hitTesting import (dòng 19 FloorPlanCanvas.svelte)**

Xóa `findEntourageAt` khỏi import dòng 19.

- [ ] **Step 8: Xóa entourage trong PropertiesPanel.svelte**

Xóa dòng 3:
```typescript
  import { getEntourageDef } from '$lib/utils/entourageCatalog';
```

Tìm và xóa dòng 815 (và context block bao quanh nếu là phần riêng của entourage props):
```svelte
<p class="text-sm text-gray-700">{getEntourageDef(selectedEntourage.defId)?.name ?? 'Custom image'}</p>
```

Chạy grep trước để xem block đầy đủ:
```powershell
Select-String -Path src/lib/components/sidebar/PropertiesPanel.svelte -Pattern "entourage|Entourage" -CaseSensitive:$false
```

- [ ] **Step 9: Xóa file entourageCatalog.ts**

```powershell
Remove-Item src/lib/utils/entourageCatalog.ts
```

- [ ] **Step 10: Chạy check**

```powershell
npm run check
```

Expected: 0 errors. Nếu còn lỗi về `CustomEntourageDef` type — xóa nốt type import đó khỏi canvasRenderer.ts và FloorPlanCanvas.svelte.

- [ ] **Step 11: Commit**

```powershell
git add src/lib/utils/canvasRenderer.ts src/lib/components/editor/FloorPlanCanvas.svelte src/lib/components/sidebar/PropertiesPanel.svelte src/lib/utils/entourageCatalog.ts
git commit -m "chore: remove entourage rendering, interaction, and catalog"
```

---

## Task 4: Xóa housing core (roomDetection + materials + textureGenerator)

Task lớn nhất. Làm theo thứ tự: canvasRenderer → FloorPlanCanvas → ThreeViewer → xóa 3 utils.

**Files:**
- Modify: `src/lib/utils/canvasRenderer.ts`
- Modify: `src/lib/components/editor/FloorPlanCanvas.svelte`
- Modify: `src/lib/components/viewer3d/ThreeViewer.svelte`
- Delete: `src/lib/utils/roomDetection.ts`, `src/lib/utils/materials.ts`, `src/lib/utils/textureGenerator.ts`

### Sub-task 4A: Dọn canvasRenderer.ts

- [ ] **Step 1: Xóa 3 import housing trong canvasRenderer.ts**

Xóa dòng 13:
```typescript
import { getRoomPolygon, roomCentroid } from '$lib/utils/roomDetection';
```

Xóa dòng 14:
```typescript
import { getWallTextureCanvas, getFloorTextureCanvas } from '$lib/utils/textureGenerator';
```

canvasRenderer.ts **không** import `getMaterial` trực tiếp (materials.ts được dùng qua FloorPlanCanvas và ThreeViewer, không qua canvasRenderer).

- [ ] **Step 2: Xóa 16 housing functions trong canvasRenderer.ts**

Xóa các hàm sau theo thứ tự từ trên xuống (tìm bằng tên hàm, xóa từ `export function X` đến closing `}` khớp):

| Hàm | Line bắt đầu | Ghi chú |
|-----|-------------|---------|
| `wallLength` | ~20 | |
| `wallPointAt` | ~38 | |
| `wallTangentAt` | ~52 | |
| `wallEdgeInsets` | ~76 | |
| `drawWall` | ~147 | Hàm lớn nhất (~272 lines) |
| `drawDoorOnWall` | ~419 | |
| `drawWindowOnWall` | ~641 | |
| `drawDoorDistanceDimensions` | ~816 | |
| `drawWindowDistanceDimensions` | ~860 | |
| `drawStair` | ~1010 | |
| `drawColumn` | ~1159 | |
| `getRoomFill` | ~1397 | |
| `drawRoomFloorPattern` | ~1418 | |
| `drawRooms` | ~1493 | |
| `drawWallJoints` | ~1547 | |
| `drawSnapPoints` | ~1573 | |

Sau khi xóa, kiểm tra còn unused imports không (`Wall`, `Door`, `Window as Win`, `Room`, `Stair`, `Column` từ dòng 6 — có thể xóa nếu không còn dùng trong các hàm còn lại). Dùng `npm run check` để xác nhận.

### Sub-task 4B: Dọn FloorPlanCanvas.svelte (imports)

- [ ] **Step 3: Xóa import roomDetection (dòng 6)**

```typescript
  import { detectRooms, getRoomPolygon, roomCentroid } from '$lib/utils/roomDetection';
```

- [ ] **Step 4: Xóa import materials (dòng 7)**

```typescript
  import { getMaterial } from '$lib/utils/materials';
```

- [ ] **Step 5: Xóa import textureGenerator (dòng 13)**

```typescript
  import { getWallTextureCanvas, getFloorTextureCanvas, setTextureLoadCallback } from '$lib/utils/textureGenerator';
```

- [ ] **Step 6: Cập nhật import canvasRenderer (dòng 17)**

Xóa tất cả housing aliases khỏi import. Kết quả sau khi xóa:
```typescript
  import { drawFurnitureItem, drawGuides as _drawGuides, drawPersistedMeasurements as _drawPersistedMeasurements, drawTextAnnotations as _drawTextAnnotations, drawAnnotation as _drawAnnotation, drawAnnotations as _drawAnnotations, drawMinimap as _drawMinimap } from '$lib/utils/canvasRenderer';
```

(Các alias bị xóa: `drawWall as _drawWall`, `drawDoorOnWall as _drawDoorOnWall`, `drawWindowOnWall as _drawWindowOnWall`, `drawDoorDistanceDimensions as _drawDoorDistanceDimensions`, `drawWindowDistanceDimensions as _drawWindowDistanceDimensions`, `drawStair as _drawStair`, `drawColumn as _drawColumn`, `drawRooms as _drawRooms`, `drawWallJoints as _drawWallJoints`, `drawSnapPoints as _drawSnapPoints`)

- [ ] **Step 7: Dọn import stores/project (dòng 3 FloorPlanCanvas.svelte)**

Xóa các store/action housing-specific khỏi import. Chạy grep để tìm từng cái còn dùng không:
```powershell
$names = @("addWall","addDoor","addWindow","updateWall","moveWallEndpoint","updateDoor","updateWindow","updateRoom","selectedRoomId","placingDoorType","placingWindowType","detectedRoomsStore","duplicateDoor","duplicateWindow","duplicateWall","moveWallParallel","splitWall","placingStair","addStair","moveStair","updateStair","placingColumn","placingColumnShape","addColumn","moveColumn","updateColumn","calibrationMode","calibrationPoints","elevationWallId","elevationPickMode")
foreach ($n in $names) {
  $count = (Select-String -Path src/lib/components/editor/FloorPlanCanvas.svelte -Pattern "\b$n\b" | Measure-Object).Count
  if ($count -le 1) { Write-Host "SAFE TO REMOVE: $n (only in import)" }
  else { Write-Host "STILL USED ($count lines): $n" }
}
```

Xóa tất cả các tên chỉ xuất hiện 1 lần (tức chỉ ở dòng import).

- [ ] **Step 8: Dọn import hitTesting (dòng 19 FloorPlanCanvas.svelte)**

Xóa các housing hit-test functions. Kết quả giữ lại:
```typescript
  import { pointInPolygon, findFurnitureAt as _findFurnitureAt, hitTestMeasurement as _hitTestMeasurement, hitTestAnnotation as _hitTestAnnotation, hitTestTextAnnotation as _hitTestTextAnnotation } from '$lib/utils/hitTesting';
```

(Xóa: `positionOnWall`, `findWallAt as _findWallAt`, `findHandleAt as _findHandleAt`, `findColumnAt as _findColumnAt`, `findStairAt as _findStairAt`, `findDoorAt as _findDoorAt`, `findWindowAt as _findWindowAt`, `findRoomAt as _findRoomAt`)

- [ ] **Step 9: Xóa type imports housing trong FloorPlanCanvas.svelte (dòng 4–5)**

Dòng 4 import types. Xóa các housing-specific types không còn dùng sau khi xóa interaction code: `Wall`, `Door`, `Window as Win`, `Stair`, `Column`. Giữ: `Point`, `FurnitureItem`, `GuideLine`, `Measurement`, `Annotation`, `TextAnnotation`.

Dòng 5: `import type { Floor, Room } from '$lib/models/types';` — `Room` có thể xóa nếu không còn dùng. Giữ `Floor`.

Chạy `npm run check` sau bước này để xác nhận.

### Sub-task 4C: Xóa housing render calls trong draw loop (FloorPlanCanvas.svelte)

- [ ] **Step 10: Xóa housing render calls trong hàm draw()**

Tìm hàm draw() trong FloorPlanCanvas.svelte. Xóa các dòng gọi housing rendering:

```powershell
Select-String -Path src/lib/components/editor/FloorPlanCanvas.svelte -Pattern "_drawWall|_drawDoor|_drawWindow|_drawStair|_drawColumn|_drawRoom|_drawWallJoint|_drawSnap|drawRooms|detectRooms"
```

Xóa tất cả dòng và block code bao quanh chúng (wall drawing loop, door loop, window loop, stair loop, column loop, room detection call, room drawing call, wall joints call, snap points call).

### Sub-task 4D: Xóa housing interaction code (FloorPlanCanvas.svelte)

- [ ] **Step 11: Xóa housing state variables**

Grep tìm state variables housing:
```powershell
Select-String -Path src/lib/components/editor/FloorPlanCanvas.svelte -Pattern "wallStart|wallSnap|doorPlacing|windowPlacing|stairPlacing|columnPlacing|detectedRooms|currentEntourage"
```

Xóa các `let` declarations và `$state(...)` cho các biến housing-specific.

- [ ] **Step 12: Xóa housing event handlers trong onMouseDown/onMouseMove/onMouseUp**

Các tool handlers cần xóa: `'wall'`, `'door'`, `'window'`, `'stair'`, `'column'`, `'room'` cases trong switch/if của event handlers. Grep:
```powershell
Select-String -Path src/lib/components/editor/FloorPlanCanvas.svelte -Pattern "selectedTool.*wall|case 'wall'|case 'door'|case 'window'|case 'stair'|case 'column'|case 'room'"
```

Xóa từng case/block tương ứng.

- [ ] **Step 13: Xóa textureLoadCallback setup**

Grep:
```powershell
Select-String -Path src/lib/components/editor/FloorPlanCanvas.svelte -Pattern "setTextureLoadCallback|getWallTextureCanvas|getFloorTextureCanvas|getMaterial"
```

Xóa tất cả dòng tìm được.

### Sub-task 4E: Dọn ThreeViewer.svelte

- [ ] **Step 14: Xóa housing imports trong ThreeViewer.svelte**

Xóa dòng 6 (wallColors — chỉ dùng cho tường 3D):
```typescript
  import { wallColors, type WallColor } from '$lib/utils/materials';
```

Xóa dòng 16:
```typescript
  import { detectRooms, getRoomPolygon, roomCentroid } from '$lib/utils/roomDetection';
```

Xóa dòng 17:
```typescript
  import { getMaterial } from '$lib/utils/materials';
```

Xóa dòng 18:
```typescript
  import { getWallTextureCanvas, getFloorTextureCanvas, setTextureLoadCallback } from '$lib/utils/textureGenerator';
```

- [ ] **Step 15: Xóa housing type imports trong ThreeViewer.svelte (dòng 5)**

```typescript
  import type { Floor, Wall, Door, Window as Win, Room, Stair } from '$lib/models/types';
```

Xóa các types không còn dùng sau cleanup: `Wall`, `Door`, `Window as Win`, `Room`, `Stair`. Giữ `Floor`.

- [ ] **Step 16: Xóa wall/room rendering sections trong ThreeViewer.svelte**

Grep để tìm tất cả usage:
```powershell
Select-String -Path src/lib/components/viewer3d/ThreeViewer.svelte -Pattern "detectRooms|getRoomPolygon|roomCentroid|getMaterial|getWallTexture|getFloorTexture|setTextureLoad|wallColors|WallColor|floor\.walls|floor\.rooms|floor\.doors|floor\.stairs"
```

Kết quả sẽ chỉ ra các blocks cần xóa. Các vị trí đã biết:
- Line ~978: `getWallTextureCanvas` trong wall mesh building
- Lines ~1543–1627: room detection + 3D room mesh generation (detectRooms, getRoomPolygon, getMaterial, getFloorTextureCanvas, roomCentroid)
- Lines ~1993–2010: detectRooms + getRoomPolygon trong minimap/camera fit
- Line ~2110: `setTextureLoadCallback`

Xóa từng block hoàn chỉnh (tìm boundary của block chứa các calls đó và xóa block).

- [ ] **Step 17: Xóa store import `detectedRoomsStore` trong ThreeViewer.svelte (dòng 4)**

```typescript
  import { activeFloor, currentProject, detectedRoomsStore, selectedElementId } from '$lib/stores/project';
```

Xóa `detectedRoomsStore` khỏi import này.

### Sub-task 4F: Xóa 3 utils và verify

- [ ] **Step 18: Xóa 3 util files**

```powershell
Remove-Item src/lib/utils/roomDetection.ts
Remove-Item src/lib/utils/materials.ts
Remove-Item src/lib/utils/textureGenerator.ts
```

- [ ] **Step 19: Chạy check**

```powershell
npm run check
```

Expected: 0 errors. Nếu còn lỗi:
- "Cannot find module X" → grep tìm import còn sót của X và xóa
- "X is declared but never used" → xóa declaration đó
- Type error về `Wall`, `Room` etc → kiểm tra còn tham chiếu nào đến housing types trong logic code, xóa luôn

- [ ] **Step 20: Commit**

```powershell
git add src/lib/utils/canvasRenderer.ts src/lib/components/editor/FloorPlanCanvas.svelte src/lib/components/viewer3d/ThreeViewer.svelte src/lib/utils/roomDetection.ts src/lib/utils/materials.ts src/lib/utils/textureGenerator.ts
git commit -m "chore: remove housing rendering — walls, doors, windows, stairs, columns, rooms"
```

---

## Task 5: Final verification

**Files:** Không thay đổi — chỉ verify.

- [ ] **Step 1: Xác nhận 0 import còn trỏ đến 6 utils đã xóa**

```powershell
Select-String -Path src -Recurse -Pattern "cadExport|roomPresets|entourageCatalog|roomDetection|'(\./|\$lib/utils/)materials|textureGenerator" -Include "*.ts","*.svelte"
```

Expected: 0 kết quả.

- [ ] **Step 2: Chạy build production**

```powershell
npm run build
```

Expected: build thành công, không có lỗi TypeScript hay Vite.

- [ ] **Step 3: Verify runtime (dev server)**

```powershell
npm run dev
```

Mở `http://localhost:5173`:
1. Trang chủ load → danh sách sites/projects hiện
2. Click vào 1 layout → editor mở (canvas hiện, không lỗi console)
3. Kéo 1 product block từ sidebar vào canvas → block xuất hiện đúng vị trí
4. Click chuyển chế độ 3D → viewer hiện furniture
5. Click icon Timeline → timeline hiện, chuyển ngày hoạt động
6. Trang Products: upload file DXF → chip ⏳ → ✓ DXF

- [ ] **Step 4: Commit nếu có fix nhỏ từ Step 1–3**

```powershell
git add -A
git commit -m "chore: final housing removal cleanup — build and runtime verified"
```
