# Phase 6: Plan vs Snapshot Comparison — Design Spec

## Goal

Them tinh nang so sanh ke hoach (Plan) voi thuc te (Snapshot) bang overlay tren canvas 2D. Nguoi dung bat toggle "So sanh" tren toolbar, backend tra ve ket qua match tung PlanItem voi Position, frontend render overlay mau theo trang thai.

## Backend API

### GET /api/plans/:planId/compare?snapshotId=xxx

Neu khong co `snapshotId`: lay snapshot moi nhat cua cung layout (thong qua plan.layoutId).

Logic so sanh:
1. Lay tat ca PlanItem cua plan (chi nhung item co startDate <= snapshotDate <= endDate)
2. Lay tat ca Position cua snapshot
3. Match theo productId:
   - `matched`: co trong ca plan va snapshot, khoang cach < 2m
   - `misplaced`: co trong ca plan va snapshot, khoang cach >= 2m
   - `missing`: co trong plan nhung khong co trong snapshot
   - `unplanned`: co trong snapshot nhung khong co trong plan

Response:
```json
{
  "planId": "...",
  "snapshotId": "...",
  "snapshotDate": "2026-08-10",
  "items": [
    {
      "productId": "...",
      "productName": "Dam chinh ST4",
      "productCode": "10020-07",
      "status": "matched | misplaced | missing | unplanned",
      "planned": { "x": 15, "y": 15 } | null,
      "actual": { "x": 15, "y": 15 } | null,
      "distanceM": 0 | null
    }
  ],
  "summary": { "matched": 0, "misplaced": 0, "missing": 0, "unplanned": 0 }
}
```

Nguong matched vs misplaced: khoang cach Euclidean < 2 met.

## Frontend

### Toggle tren toolbar (tab "Bo tri")

Nut toggle "So sanh" tren toolbar editor, chi hien khi co backendLayoutId.
- Mac dinh: tat
- Bat: fetch compare API (plan active + snapshot moi nhat), hien overlay
- Dropdown nho ben canh: chon Plan va ngay snapshot

### ComparisonOverlay.svelte

Render len canvas 2D (absolute positioning chong len FloorPlanCanvas):
- matched: vien xanh la, net dut
- misplaced: vien cam, bong mo tai vi tri ke hoach + mui ten tu actual -> planned
- missing: vien do, net dut tai vi tri ke hoach
- unplanned: vien vang quanh san pham thuc te

Summary badge goc phai tren: "2 dung | 1 lech | 1 thieu | 1 thua"

### Products sidebar (BuildPanel)

Khi overlay bat, hien icon trang thai ben canh moi san pham trong danh sach.

## Pham vi thay doi

| File | Thao tac |
|------|----------|
| `floor-manager/server/routes/plans.ts` | Them GET /:id/compare |
| `floor-manager/tests/plans.test.ts` | Them tests cho compare endpoint |
| `floor-manager-web/src/lib/services/api.ts` | Them api.plans.compare() + type |
| `floor-manager-web/src/lib/components/editor/ComparisonOverlay.svelte` | Moi — overlay component |
| `floor-manager-web/src/routes/editor/+page.svelte` | Them toggle, state, overlay |

## Khong lam

- Khong them tab moi
- Khong thay doi Gantt chart
- Khong auto-refresh (fetch 1 lan khi bat, refresh thu cong)
- Khong PDF/export bao cao so sanh
