# Khôi phục vẽ tường 2D và sửa lệnh Add Wall

Ngày: 2026-08-24

## Nguyên nhân gốc

Hai commit dọn dẹp sau khi fork đã bỏ tính năng tường, nhưng bỏ sót UI:

- `b375cdc` *hide house-design tools from editor UI* — gỡ nút Wall khỏi BuildPanel.
- `5af8287` *remove housing rendering — walls, doors, windows, stairs, columns,
  rooms* — xoá code vẽ tường ở canvas 2D, 3D viewer, PropertiesPanel, print,
  export.

Mục "Add Wall" trong `ContextMenu.svelte` sống sót cả hai lần dọn. Nó chạy
`selectedTool.set('wall')`, dẫn tới hai triệu chứng:

1. **Không hiển thị tường.** `addWall()` vẫn đẩy tường vào `floor.walls` — dữ
   liệu có thật — nhưng hàm `draw()` không còn vòng lặp nào vẽ `floor.walls`.
   Chỉ preview nét đứt lúc đang kéo được vẽ, nên click xong là tường biến mất.
2. **Không thoát được lệnh.** BuildPanel không còn nút Wall nên không có gì
   sáng lên báo đang ở chế độ vẽ tường, cũng không có gì để bấm tắt. `Esc` và
   `V` vẫn thoát (đăng ký ở window) nhưng không có gợi ý nào trên màn hình.
   Chuột phải không huỷ. Ngoài ra `Esc` không xoá `wallStart`, khiến `draw()`
   giữ cờ dirty và redraw 60fps vĩnh viễn.

Phần tương tác tường vẫn nguyên vẹn: hit-test, chọn, kéo đầu mút, kéo song
song, kéo tay nắm cong, `splitWall`, `duplicateWall`, context menu của tường.
Chỉ mất phần vẽ.

## Phạm vi

Khôi phục 2D + đường thoát lệnh + sửa thuộc tính. Không đụng 3D viewer, print,
export — phần đó bị xoá sâu hơn nhiều và không cần cho việc vẽ ranh giới xưởng.

## Thiết kế

### `drawWall` trong `canvasRenderer.ts`

Pure function theo pattern các hàm draw còn lại:

```ts
export function drawWall(cs: CanvasState, w: Wall, selected: boolean,
                         showDimensions: boolean, dimSettings: ProjectSettings): void
```

- Tường thẳng: dải dày `thickness × zoom` (tối thiểu 4px), tô theo `w.color`,
  viền đậm hơn; khi chọn thì xanh.
- Tường cong (`curvePoint`): dải bezier 24 đoạn — vẫn cần vì thao tác kéo tay
  nắm cong còn nguyên trong canvas.
- Nhãn chiều dài ở giữa tường khi `showDimensions`.
- Khi chọn: hai tay nắm tròn ở đầu mút, một tay nắm hình thoi ở giữa (hoặc tại
  `curvePoint`) — đúng bán kính `15 / zoom` mà hit-test đang dùng, không vẽ thì
  tay nắm vô hình.

Không khôi phục texture (`textureGenerator` đã xoá cùng commit) và các chế độ
dimension edge/center của bản nhà ở.

Bốn helper hình học `wallLength`, `wallPointAt`, `wallTangentAt`,
`wallThicknessScreen` đang nằm trong `FloorPlanCanvas.svelte` được chuyển sang
`canvasRenderer.ts` và export, để renderer và component dùng chung.
`wallThicknessScreen` nhận thêm tham số `zoom`.

### Nối vào `draw()`

Vẽ trước furniture để tường nằm dưới block, bọc trong `if (layerVis.walls)`.
Toggle "walls" trong LayersPanel hiện không có tác dụng; sau thay đổi này nó
hoạt động.

### Nút Wall trong BuildPanel

Thêm vào nhóm Tools cạnh Select, phím tắt W, sáng khi `currentTool === 'wall'`.
Đây là chỗ báo trạng thái và là đường thoát bằng chuột.

### Thoát lệnh sạch

- `Esc` khi đang vẽ dở: huỷ đoạn đang vẽ, vẫn ở tool wall. `Esc` lần hai thoát
  về select theo hành vi global sẵn có.
- Chuột phải khi tool = wall: đang vẽ dở thì huỷ đoạn, không vẽ dở thì về
  select. Không mở context menu.
- Khi `selectedTool` rời khỏi `'wall'`: reset `wallStart`, `wallSequenceFirst`,
  `typedWallLength`. Việc này cũng chấm dứt vòng redraw 60fps vĩnh viễn.
- Hint trên canvas khi tool = wall: "Click đặt điểm · C khép vòng · Esc huỷ".

### PropertiesPanel

Khối "Tường" khi phần tử đang chọn là wall: độ dày, chiều cao, màu (ghi qua
`updateWall`) và chiều dài chỉ đọc.

## Kiểm chứng

Web app không có test runner; dựng vitest riêng cho việc này nằm ngoài yêu cầu.
Kiểm chứng gồm `npm run check` 0 errors, `npm run build` pass, và chạy tay:

- Add Wall từ context menu → nút Wall sáng trong panel Tools.
- Vẽ vài đoạn tường → tường hiện ra và ở lại sau khi click.
- Chuột phải và `Esc` huỷ được, thoát được về Select.
- Chọn tường → tay nắm hiện đúng chỗ, kéo đầu mút và kéo song song chạy được.
- PropertiesPanel đổi độ dày / màu → canvas cập nhật.
- Tắt layer "walls" trong LayersPanel → tường ẩn.
