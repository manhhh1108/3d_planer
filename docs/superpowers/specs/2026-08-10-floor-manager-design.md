# Floor Manager - Design Spec

## Overview

Web app quan ly mat bang san xuat/bai chua, thay the viec tao nhieu file CAD moi ngay de theo doi vi tri san pham/thiet bi. Cho phep keo tha block san pham len layout 2D, luu snapshot vi tri theo ngay, xem 3D, xuat bao cao PDF.

## Target Users

- Nhan vien quan ly mat bang nha may / bai chua ket cau
- Quan ly ca san pham gia cong (dam, cot, panel, module) lan thiet bi (may CNC, cau, xe nang)
- Phan quyen: chua xac dinh, se bo sung sau

## Architecture

### Monolith - React + Node.js + PostgreSQL

```
React SPA (Vite)
  ├── 2D Editor (Konva.js, tham khao react-planner)
  ├── 3D Viewer (Three.js + React Three Fiber)
  └── Dashboard / Reports (Ant Design)
        │
        │ REST API
        ▼
Node.js / Express
  ├── API Routes
  ├── CAD Worker (BullMQ + Redis)
  ├── PDF Export (jsPDF)
  └── SharePoint integration (Microsoft Graph API)
        │
        ▼
PostgreSQL (Prisma ORM)
```

### Tech Stack

| Role | Library |
|---|---|
| 2D Canvas | Konva.js + react-konva (fork pattern tu react-planner) |
| 3D Viewer | Three.js + React Three Fiber |
| STEP/STP parser | occt-import-js (OpenCASCADE WASM) |
| DWG/DXF converter | ODA File Converter (backend CLI) |
| DXF parser | dxf-parser (npm) |
| IFC parser | web-ifc (WASM) |
| Database | PostgreSQL + Prisma ORM |
| Job Queue | BullMQ + Redis |
| PDF Export | jsPDF |
| UI Components | Ant Design |
| Build tool | Vite |

## Data Model

### Project
- id (PK)
- name
- description
- created_at
- updated_at

### Layout
- id (PK)
- project_id (FK -> Project)
- name
- width_m (chieu rong mat bang, met)
- height_m (chieu dai mat bang, met)
- background_file (path SVG/DXF da convert tu DWG)
- grid_size (met, default 1.0)

### Product
- id (PK)
- project_id (FK -> Project)
- name
- code (ma san pham, VD: SP-001)
- weight_kg
- area_m2
- process_stage (cong doan: Han, Son, Lap rap, Cat, ...)
- category (san_pham | thiet_bi)
- color (hex color cho block 2D)
- file_2d_url (path/URL file DWG/DXF)
- file_3d_url (path/URL file STEP/STP/IFC)
- thumbnail (path PNG da render)
- sharepoint_link (URL SharePoint neu co)
- metadata (JSON - thong tin bo sung)

### Snapshot
- id (PK)
- layout_id (FK -> Layout)
- date (DATE - ngay snapshot)
- note (ghi chu)
- created_at
- created_by

### Position
- id (PK)
- snapshot_id (FK -> Snapshot)
- product_id (FK -> Product)
- x (toa do X, met)
- y (toa do Y, met)
- rotation (goc xoay, do)
- scale (ty le, default 1.0)

### Relationships
- Project 1:N Layout
- Project 1:N Product
- Layout 1:N Snapshot
- Snapshot 1:N Position
- Product 1:N Position

## Screens

### 1. Dashboard
- Danh sach du an dang card
- Tao / sua / xoa du an
- Hien thi: ten, mo ta, so san pham, so mat bang, ngay cap nhat, trang thai

### 2. Quan ly San pham
- Bang danh sach san pham cua du an
- CRUD san pham: ten, ma, khoi luong, dien tich, cong doan, mau sac
- Upload/link file 2D (DWG), 3D (STEP/IFC)
- Preview 3D inline khi click vao san pham
- Hien thi vi tri hien tai (layout nao, toa do)

### 3. Layout Editor 2D (Man hinh chinh)

Layout:
- Toolbar tren: save snapshot, load date, export PDF, zoom, grid, snap, undo/redo
- Panel trai: danh sach san pham (keo tha vao canvas)
- Canvas giua: Konva.js voi grid, background DWG (SVG), cac block san pham
- Panel phai: thuoc tinh block dang chon (ten, ma, KL, DT, cong doan, toa do, file links, lich su vi tri)
- Coord bar: hien thi X, Y, W, H, rotation, zoom, grid size
- Timeline bar: danh sach snapshot theo ngay, chon ngay de xem lai

Tinh nang canvas:
- Snap to grid (cau hinh grid size)
- Hien thi toa do chinh xac (met)
- Do khoang cach giua cac block
- Nhap toa do X/Y truc tiep
- Block hien thi: ten, dien tich, mau theo cong doan
- Chon block -> highlight + hien thuoc tinh

Luong su dung:
1. Chon layout -> load snapshot moi nhat
2. Keo san pham tu panel trai -> tha vao canvas
3. Di chuyen, xoay block -> snap to grid
4. Click block -> xem thuoc tinh ben phai
5. Nhan Save Snapshot -> luu toan bo vi tri cho ngay hom nay
6. Dung Timeline de xem lai snapshot ngay truoc

### 4. 3D Viewer
- Load tat ca san pham trong snapshot hien tai
- Render file 3D (STEP -> gITF) tai dung vi tri (x, y) tu layout 2D
- Orbit camera, zoom, pan
- Click san pham -> highlight + hien thong tin
- Chuyen qua lai giua 2D va 3D

### 5. Bao cao
- 3 loai bao cao dang bang:

**Bao cao 1: Tong hop mat bang theo ngay**
- Cot: STT, San pham, Ma, Vi tri (X,Y), Dien tich, Khoi luong, Cong doan, So ngay tai vi tri

**Bao cao 2: Theo cong doan**
- Cot: Cong doan, So san pham, Tong dien tich, Tong khoi luong, Ty le dien tich

**Bao cao 3: Thoi gian chiem dung mat bang**
- Cot: San pham, Layout, Tu ngay, Den ngay, So ngay, Dien tich, m2 x ngay
- m2 x ngay = dien tich x so ngay chiem dung

**Thong ke tong quan:**
- Tong san pham, tong dien tich chiem, dien tich mat bang, ty le su dung (%)

- Nut xuat PDF cho moi bao cao

## CAD File Processing

### Pipeline
1. User upload file hoac paste SharePoint link
2. Backend detect dinh dang, tao BullMQ job
3. Worker xu ly:
   - DWG -> ODA File Converter -> DXF -> dxf-parser -> SVG (dung lam background layout)
   - STEP/STP -> occt-import-js -> glTF (dung cho 3D viewer)
   - IFC -> web-ifc -> glTF + metadata
4. Tao thumbnail PNG (render 1 goc)
5. Trich xuat bounding box -> tinh dien tich chiem san (width x depth)
6. Luu output (glTF, SVG, PNG) + cap nhat DB

### File Storage
- **Local mode**: upload vao `./uploads/`, file da convert vao `./uploads/converted/`
- **SharePoint mode**: luu link SharePoint trong DB, backend fetch qua Microsoft Graph API khi can, convert va cache output local
- File goc co the xoa sau khi convert, chi giu output + link goc

## PDF Export

### Layout PDF
- Header: ten du an, ten layout, ngay snapshot
- Body: anh chup canvas 2D (Konva -> toDataURL -> PNG)
- Table: danh sach san pham voi vi tri, dien tich, cong doan
- Footer: tong dien tich, ty le su dung

### Report PDF
- Render bang bao cao tuong ung thanh PDF
- Dung jsPDF voi autoTable plugin

## Tinh toan thoi gian chiem dung

So sanh snapshots lien tiep:
- Neu san pham xuat hien o cung layout trong 2 snapshot lien tiep -> tinh la lien tuc
- Neu san pham chuyen sang layout khac hoac bien mat -> ket thuc chuoi hien tai, bat dau chuoi moi
- So ngay = ngay cuoi - ngay dau cua chuoi
- m2 x ngay = dien tich san pham x so ngay

## Project Structure

```
floor-manager/
├── package.json
├── prisma/
│   └── schema.prisma
├── server/
│   ├── index.ts
│   ├── routes/
│   │   ├── projects.ts
│   │   ├── products.ts
│   │   ├── layouts.ts
│   │   ├── snapshots.ts
│   │   ├── files.ts
│   │   └── reports.ts
│   ├── services/
│   │   ├── cad-converter.ts
│   │   ├── step-converter.ts
│   │   ├── ifc-converter.ts
│   │   ├── pdf-exporter.ts
│   │   ├── report-generator.ts
│   │   └── sharepoint.ts
│   ├── workers/
│   │   └── file-processor.ts
│   └── uploads/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Products.tsx
│   │   ├── LayoutEditor.tsx
│   │   ├── Viewer3D.tsx
│   │   └── Reports.tsx
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── LayoutCanvas.tsx
│   │   │   ├── GridLayer.tsx
│   │   │   ├── BackgroundLayer.tsx
│   │   │   ├── ProductBlock.tsx
│   │   │   └── SnapGuides.tsx
│   │   ├── viewer3d/
│   │   │   ├── Scene.tsx
│   │   │   ├── ProductModel.tsx
│   │   │   └── Controls.tsx
│   │   ├── panels/
│   │   │   ├── ProductPanel.tsx
│   │   │   ├── PropertyPanel.tsx
│   │   │   └── TimelineBar.tsx
│   │   └── common/
│   │       ├── FileUploader.tsx
│   │       └── PDFPreview.tsx
│   ├── hooks/
│   │   ├── useCanvas.ts
│   │   ├── useSnapshots.ts
│   │   └── useDragDrop.ts
│   └── api/
│       └── client.ts
├── docker-compose.yml
└── README.md
```

## Strategy

- Lay 2D editor core tu react-planner (canvas, drag-drop, catalog system) lam base
- Tham khao open3dFloorplan cho UI/UX patterns
- Tham khao syncfusion floor planner cho snap/grid/export
- Tu build phan con lai: quan ly san pham, snapshot theo ngay, 3D viewer, import CAD, bao cao, PDF export

## Wireframe Mockups

Co san tai: `mockups/index.html` - 5 man hinh chinh (Dashboard, San pham, Layout 2D, 3D Viewer, Bao cao)
