# Phase 5: Production Planning + Scheduling — Design Spec

## Goal

Them he thong lap ke hoach san xuat song song voi snapshot hien tai. Plan chua cac booking vi tri (PlanItem) voi startDate/endDate. Hien thi bang Gantt chart trong tab "Ke hoach" cua editor. Phat hien xung dot vi tri + goi y thoi gian trong.

## Data Model

### Plan
- id (cuid)
- layoutId (FK -> Layout)
- name (string, vd: "Plan T9", "Plan phuong an A")
- active (boolean, default true)
- createdAt

Mot Layout co nhieu Plan. Plan doc lap voi Snapshot.

### PlanItem
- id (cuid)
- planId (FK -> Plan, cascade delete)
- productId (FK -> Product, cascade delete)
- x (float) — vi tri tren layout (met)
- y (float)
- rotation (float, default 0)
- startDate (date)
- endDate (date)
- createdAt

Rang buoc: startDate < endDate. Mot product co the xuat hien nhieu lan trong cung plan (cac khoang thoi gian khac nhau).

## Backend API

### Plan CRUD

| Method | Path | Body/Query | Response |
|--------|------|-----------|----------|
| GET | /api/plans?layoutId= | query: layoutId (required) | Plan[] |
| POST | /api/plans | {layoutId, name} | Plan (201) |
| PUT | /api/plans/:id | {name?, active?} | Plan |
| DELETE | /api/plans/:id | | 204 |

### PlanItem CRUD

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | /api/plans/:id/items | | PlanItem[] (include product) |
| POST | /api/plans/:id/items | {productId, x, y, rotation?, startDate, endDate} | PlanItem (201) |
| PUT | /api/plan-items/:id | {x?, y?, rotation?, startDate?, endDate?} | PlanItem |
| DELETE | /api/plan-items/:id | | 204 |

### Conflict Detection

`GET /api/plans/:id/conflicts`

Hai PlanItem xung dot khi:
1. Cung plan
2. Thoi gian chong nhau: startA < endB AND startB < endA
3. Bounding box chong nhau: dua tren (x, y) + kich thuoc san pham (metadata.widthM, metadata.depthM). Neu san pham khong co kich thuoc, dung 1x1m mac dinh.

Response:
```json
{
  "conflicts": [
    {
      "itemA": { "id": "...", "productName": "Block A", "startDate": "2026-09-01", "endDate": "2026-09-15" },
      "itemB": { "id": "...", "productName": "Block B", "startDate": "2026-09-10", "endDate": "2026-09-25" },
      "overlapStart": "2026-09-10",
      "overlapEnd": "2026-09-15"
    }
  ],
  "suggestions": [
    {
      "itemId": "...",
      "suggestedStart": "2026-09-16",
      "reason": "Thoi gian som nhat khong xung dot voi Block A"
    }
  ]
}
```

Logic goi y: voi moi item xung dot, tim ngay bat dau som nhat sau endDate cua item kia ma khong xung dot voi bat ky item nao khac tai cung vi tri.

## Frontend

### Tab bar trong Editor

Trang editor hien tai (`/editor?layoutId=...`) them tab bar:
- [Bo tri] — hien canvas 2D hien tai (mac dinh)
- [Ke hoach] — hien Gantt chart

State `activeTab` luu trong URL query hoac local state.

### Tab "Ke hoach" gom:

#### 1. Plan Toolbar
- Dropdown chon plan hien tai (hoac tao moi)
- Nut "Tao plan" -> modal nhap ten
- Nut "Xoa plan" (confirm)
- Hien thi ten plan dang chon

#### 2. Gantt Chart (HTML/CSS, khong dung thu vien)
- Truc X: thoi gian (ngay), co the scroll ngang, zoom theo tuan/thang
- Truc Y: moi hang = 1 san pham co trong plan
- Moi PlanItem = 1 thanh ngang, mau theo processStage cua san pham
- Keo tha:
  - Keo san pham tu sidebar vao Gantt -> tao PlanItem (hien form nhap x, y, startDate, endDate)
  - Keo canh trai/phai cua thanh -> thay doi startDate/endDate
  - Keo ca thanh -> di chuyen khoang thoi gian (giu nguyen duration)
- Thanh xung dot: vien do + icon canh bao

#### 3. Product Sidebar
- Danh sach tat ca product (nhu BuildPanel hien tai)
- Draggable — keo vao Gantt de tao PlanItem
- Hien thi product nao da co trong plan (badge so luong)

#### 4. Conflict Panel (ben duoi Gantt)
- Danh sach canh bao xung dot
- Moi canh bao hien: ten 2 san pham, khoang thoi gian chong, goi y
- Click vao canh bao -> highlight 2 thanh tren Gantt
- Nut "Ap dung goi y" -> tu dong dich chuyen thoi gian

## Pham vi thay doi

| File | Thao tac |
|------|----------|
| `floor-manager/prisma/schema.prisma` | Them Plan, PlanItem model |
| `floor-manager/prisma/migrations/` | Migration moi |
| `floor-manager/server/routes/plans.ts` | Moi — CRUD plan + items + conflicts |
| `floor-manager/server/app.ts` | Them router plans |
| `floor-manager/tests/plans.test.ts` | Moi — test CRUD + conflict detection |
| `floor-manager-web/src/lib/services/api.ts` | Them api.plans.* |
| `floor-manager-web/src/routes/editor/+page.svelte` | Them tab bar, dieu kien hien thi |
| `floor-manager-web/src/lib/components/editor/GanttChart.svelte` | Moi — Gantt chart |
| `floor-manager-web/src/lib/components/editor/PlanToolbar.svelte` | Moi — toolbar chon/tao plan |
| `floor-manager-web/src/lib/components/editor/ConflictPanel.svelte` | Moi — canh bao xung dot |

## Khong lam

- Excel import/export
- So sanh Plan vs Snapshot (overlay)
- Notification/email
- Chart library ben ngoai (dung HTML/CSS)
- Auto-scheduling (tu dong xep lich)
