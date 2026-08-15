# Phase 4: Dashboard — Design Spec

## Goal

Bien trang chu (`/`) thanh dashboard tong quan voi cac chi so chinh cua nha may, giu nguyen danh sach sites/projects phia duoi. Backend them 1 endpoint `/api/dashboard` tra ve tat ca metrics trong 1 request.

## Layout trang chu moi (tu tren xuong duoi)

### 1. Summary Cards (hang ngang, 4 cards)

| Card | Du lieu |
|------|---------|
| Tong Sites | `counts.sites` |
| Tong Projects | `counts.projects` |
| Tong san pham tren mat bang | `counts.productsOnLayout` |
| Tong khoi luong | `counts.totalWeightKg` (hien don vi Tan) |

### 2. Date Picker (goc phai)

- Mac dinh: "Moi nhat" — dung snapshot moi nhat cua moi layout
- Cho phep chon ngay cu the de xem trang thai tai thoi diem do
- Khi chon ngay, tat ca metrics (layoutUsage, byProcessStage) cap nhat theo ngay do

### 3. Ty le lap day — Layout Usage Cards

Grid cards, moi layout 1 card:
- Ten layout + ten site (nho)
- Progress bar % lap day (mau xanh/do tuy ty le)
- "X m2 / Y m2" (dien tich da dung / tong)
- Click vao card -> mo editor cua layout do

### 4. San pham theo cong doan — Process Stage Chart

Hien dang bar chart ngang (HTML/CSS, khong can chart library):
- Moi thanh = 1 cong doan (Han, Son, Lap rap, Cat, Khac)
- Hien so luong san pham + tong dien tich
- Mau theo STAGE_COLORS da co trong codebase

### 5. Hoat dong gan day — Recent Activity

Danh sach 10-15 muc gan nhat, sap xep theo thoi gian giam dan:
- **Snapshot moi**: "Layout X — snapshot ngay Y — boi Z"
- **San pham moi**: "SP-001 Ten SP — them vao Project X"
- Moi muc hien thoi gian tuong doi ("2 gio truoc", "hom qua")

### 6. Danh sach Sites + Projects

Giu nguyen nhu hien tai, khong thay doi.

---

## Backend API

### `GET /api/dashboard?date=YYYY-MM-DD`

Auth: requireAuth (moi role deu xem duoc)

Response:
```json
{
  "counts": {
    "sites": 3,
    "projects": 5,
    "productsOnLayout": 42,
    "totalWeightKg": 125000,
    "totalAreaM2": 350.5
  },
  "layoutUsage": [
    {
      "layoutId": "...",
      "layoutName": "Xuong A",
      "siteName": "Nha may 1",
      "usedAreaM2": 280.0,
      "totalAreaM2": 500.0,
      "usagePercent": 56.0,
      "productCount": 15
    }
  ],
  "byProcessStage": [
    {
      "stage": "Han",
      "count": 12,
      "totalAreaM2": 120.5,
      "totalWeightKg": 45000
    }
  ],
  "recentActivity": [
    {
      "type": "snapshot",
      "description": "Xuong A — snapshot 2026-08-15",
      "layoutId": "...",
      "createdBy": "admin@test.com",
      "createdAt": "2026-08-15T10:30:00Z"
    },
    {
      "type": "product",
      "description": "SP-001 Khung thep — Don hang XYZ",
      "projectId": "...",
      "createdAt": "2026-08-14T16:00:00Z"
    }
  ]
}
```

### Logic

- Khi khong truyen `date`: tim snapshot moi nhat cua moi layout (`ORDER BY date DESC LIMIT 1` per layout)
- Khi truyen `date`: tim snapshot co `date` dung bang ngay do cho moi layout; layout khong co snapshot ngay do -> usedArea = 0
- `counts.productsOnLayout`: dem so product xuat hien trong cac snapshot duoc chon
- `recentActivity`: query 15 snapshot moi nhat + 15 product moi nhat, merge va sort theo createdAt, lay 15 muc dau

---

## Pham vi thay doi

| File | Thao tac |
|------|----------|
| `floor-manager/server/routes/dashboard.ts` | **Moi** — endpoint GET /api/dashboard |
| `floor-manager/server/app.ts` | Them router dashboard |
| `floor-manager/tests/dashboard.test.ts` | **Moi** — test endpoint |
| `floor-manager-web/src/lib/services/api.ts` | Them `api.dashboard.get(date?)` |
| `floor-manager-web/src/routes/+page.svelte` | Them dashboard section phia tren danh sach hien tai |

Khong can migration — query tu data hien co.

---

## Khong lam

- Chart library (dung HTML/CSS cho bar chart)
- Realtime/WebSocket (polling khi can)
- Sparkline/trend chart (co the them sau)
