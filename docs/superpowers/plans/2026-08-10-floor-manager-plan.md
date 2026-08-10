# Floor Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app to manage factory floor layouts — drag-drop product blocks on 2D layouts, save position snapshots by date, view in 3D, export PDF reports.

**Architecture:** Monolith with React SPA (Vite) frontend communicating via REST API with Node.js/Express backend backed by PostgreSQL. 2D canvas uses Konva.js, 3D viewer uses Three.js + React Three Fiber. CAD file conversion runs async via BullMQ workers.

**Tech Stack:** React 18, TypeScript, Vite, Konva.js, Three.js, React Three Fiber, Ant Design, Node.js, Express, Prisma ORM, PostgreSQL, BullMQ, Redis, jsPDF, occt-import-js, web-ifc, dxf-parser

---

## Phase 1: Foundation

### Task 1: Project Scaffold & Tooling

**Files:**
- Create: `floor-manager/package.json`
- Create: `floor-manager/tsconfig.json`
- Create: `floor-manager/tsconfig.node.json`
- Create: `floor-manager/vite.config.ts`
- Create: `floor-manager/index.html`
- Create: `floor-manager/src/main.tsx`
- Create: `floor-manager/src/App.tsx`
- Create: `floor-manager/src/vite-env.d.ts`
- Create: `floor-manager/.gitignore`

- [ ] **Step 1: Initialize project directory**

```bash
cd D:/3D
mkdir floor-manager && cd floor-manager
npm init -y
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install react@18 react-dom@18 react-router-dom@6 antd @ant-design/icons
npm install -D typescript @types/react @types/react-dom vite @vitejs/plugin-react
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"],
      "@server/*": ["./server/*"]
    },
    "baseUrl": "."
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
```

- [ ] **Step 6: Create index.html**

```html
<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Floor Manager</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 8: Create src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 9: Create src/App.tsx**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';

function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<div>Floor Manager - Loading...</div>} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
```

- [ ] **Step 10: Create .gitignore**

```
node_modules/
dist/
uploads/
.env
*.log
```

- [ ] **Step 11: Update package.json scripts**

Add to `scripts` in `package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 12: Verify frontend starts**

```bash
cd D:/3D/floor-manager
npm run dev
```

Expected: Vite dev server at http://localhost:3000, shows "Floor Manager - Loading..."

- [ ] **Step 13: Init git and commit**

```bash
cd D:/3D/floor-manager
git init
git add -A
git commit -m "chore: initial project scaffold with Vite + React + TypeScript"
```

---

### Task 2: Database Schema & Prisma Setup

**Files:**
- Create: `floor-manager/prisma/schema.prisma`
- Create: `floor-manager/docker-compose.yml`
- Create: `floor-manager/.env`

- [ ] **Step 1: Install Prisma dependencies**

```bash
cd D:/3D/floor-manager
npm install prisma @prisma/client
npm install -D tsx
npx prisma init
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: floormanager
      POSTGRES_PASSWORD: floormanager123
      POSTGRES_DB: floormanager
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  pgdata:
```

- [ ] **Step 3: Create .env**

```
DATABASE_URL="postgresql://floormanager:floormanager123@localhost:5432/floormanager"
REDIS_URL="redis://localhost:6379"
PORT=4000
UPLOAD_DIR="./uploads"
```

- [ ] **Step 4: Write prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Project {
  id          String    @id @default(cuid())
  name        String
  description String?
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  layouts     Layout[]
  products    Product[]

  @@map("projects")
}

model Layout {
  id             String     @id @default(cuid())
  projectId      String     @map("project_id")
  name           String
  widthM         Float      @map("width_m")
  heightM        Float      @map("height_m")
  backgroundFile String?    @map("background_file")
  gridSize       Float      @default(1.0) @map("grid_size")
  createdAt      DateTime   @default(now()) @map("created_at")
  project        Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  snapshots      Snapshot[]

  @@map("layouts")
}

model Product {
  id             String     @id @default(cuid())
  projectId      String     @map("project_id")
  name           String
  code           String
  weightKg       Float?     @map("weight_kg")
  areaM2         Float?     @map("area_m2")
  processStage   String?    @map("process_stage")
  category       String     @default("san_pham")
  color          String     @default("#58a6ff")
  file2dUrl      String?    @map("file_2d_url")
  file3dUrl      String?    @map("file_3d_url")
  thumbnail      String?
  sharepointLink String?    @map("sharepoint_link")
  metadata       Json?
  createdAt      DateTime   @default(now()) @map("created_at")
  project        Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  positions      Position[]

  @@map("products")
}

model Snapshot {
  id        String     @id @default(cuid())
  layoutId  String     @map("layout_id")
  date      DateTime   @db.Date
  note      String?
  createdAt DateTime   @default(now()) @map("created_at")
  createdBy String?    @map("created_by")
  layout    Layout     @relation(fields: [layoutId], references: [id], onDelete: Cascade)
  positions Position[]

  @@unique([layoutId, date])
  @@map("snapshots")
}

model Position {
  id         String   @id @default(cuid())
  snapshotId String   @map("snapshot_id")
  productId  String   @map("product_id")
  x          Float
  y          Float
  rotation   Float    @default(0)
  scale      Float    @default(1.0)
  snapshot   Snapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([snapshotId, productId])
  @@map("positions")
}
```

- [ ] **Step 5: Start Docker containers**

```bash
cd D:/3D/floor-manager
docker-compose up -d
```

Expected: postgres and redis containers running.

- [ ] **Step 6: Run Prisma migration**

```bash
npx prisma migrate dev --name init
```

Expected: Migration applied, `prisma/migrations/` directory created.

- [ ] **Step 7: Verify Prisma client generates**

```bash
npx prisma generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add database schema with Prisma (Project, Layout, Product, Snapshot, Position)"
```

---

### Task 3: Express Backend & API Scaffold

**Files:**
- Create: `floor-manager/server/index.ts`
- Create: `floor-manager/server/db.ts`
- Create: `floor-manager/server/routes/projects.ts`
- Create: `floor-manager/server/routes/products.ts`
- Create: `floor-manager/server/routes/layouts.ts`
- Create: `floor-manager/server/routes/snapshots.ts`
- Create: `floor-manager/server/routes/reports.ts`

- [ ] **Step 1: Install backend dependencies**

```bash
cd D:/3D/floor-manager
npm install express cors multer dotenv
npm install -D @types/express @types/cors @types/multer
```

- [ ] **Step 2: Create server/db.ts**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
```

- [ ] **Step 3: Create server/index.ts**

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import projectsRouter from './routes/projects';
import productsRouter from './routes/products';
import layoutsRouter from './routes/layouts';
import snapshotsRouter from './routes/snapshots';
import reportsRouter from './routes/reports';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/projects', projectsRouter);
app.use('/api/products', productsRouter);
app.use('/api/layouts', layoutsRouter);
app.use('/api/snapshots', snapshotsRouter);
app.use('/api/reports', reportsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 4: Create server/routes/projects.ts**

```typescript
import { Router } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/projects
router.get('/', async (_req, res) => {
  const projects = await prisma.project.findMany({
    include: {
      _count: { select: { layouts: true, products: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(projects);
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      layouts: true,
      products: true,
    },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// POST /api/projects
router.post('/', async (req, res) => {
  const { name, description } = req.body;
  const project = await prisma.project.create({
    data: { name, description },
  });
  res.status(201).json(project);
});

// PUT /api/projects/:id
router.put('/:id', async (req, res) => {
  const { name, description } = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { name, description },
  });
  res.json(project);
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
```

- [ ] **Step 5: Create server/routes/products.ts**

```typescript
import { Router } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/products?projectId=xxx
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  const products = await prisma.product.findMany({
    where: projectId ? { projectId: projectId as string } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  res.json(products);
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
  });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// POST /api/products
router.post('/', async (req, res) => {
  const product = await prisma.product.create({ data: req.body });
  res.status(201).json(product);
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(product);
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  await prisma.product.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
```

- [ ] **Step 6: Create server/routes/layouts.ts**

```typescript
import { Router } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/layouts?projectId=xxx
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  const layouts = await prisma.layout.findMany({
    where: projectId ? { projectId: projectId as string } : undefined,
    include: { _count: { select: { snapshots: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(layouts);
});

// GET /api/layouts/:id
router.get('/:id', async (req, res) => {
  const layout = await prisma.layout.findUnique({
    where: { id: req.params.id },
    include: { snapshots: { orderBy: { date: 'desc' }, take: 10 } },
  });
  if (!layout) return res.status(404).json({ error: 'Layout not found' });
  res.json(layout);
});

// POST /api/layouts
router.post('/', async (req, res) => {
  const layout = await prisma.layout.create({ data: req.body });
  res.status(201).json(layout);
});

// PUT /api/layouts/:id
router.put('/:id', async (req, res) => {
  const layout = await prisma.layout.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(layout);
});

// DELETE /api/layouts/:id
router.delete('/:id', async (req, res) => {
  await prisma.layout.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
```

- [ ] **Step 7: Create server/routes/snapshots.ts**

```typescript
import { Router } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/snapshots?layoutId=xxx
router.get('/', async (req, res) => {
  const { layoutId } = req.query;
  const snapshots = await prisma.snapshot.findMany({
    where: layoutId ? { layoutId: layoutId as string } : undefined,
    orderBy: { date: 'desc' },
  });
  res.json(snapshots);
});

// GET /api/snapshots/:id (with positions + product data)
router.get('/:id', async (req, res) => {
  const snapshot = await prisma.snapshot.findUnique({
    where: { id: req.params.id },
    include: {
      positions: {
        include: { product: true },
      },
    },
  });
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
  res.json(snapshot);
});

// POST /api/snapshots (save snapshot with all positions)
router.post('/', async (req, res) => {
  const { layoutId, date, note, positions } = req.body;
  // positions: Array<{ productId, x, y, rotation, scale }>

  const snapshot = await prisma.snapshot.upsert({
    where: {
      layoutId_date: { layoutId, date: new Date(date) },
    },
    update: {
      note,
      positions: {
        deleteMany: {},
        create: positions.map((p: { productId: string; x: number; y: number; rotation?: number; scale?: number }) => ({
          productId: p.productId,
          x: p.x,
          y: p.y,
          rotation: p.rotation ?? 0,
          scale: p.scale ?? 1.0,
        })),
      },
    },
    create: {
      layoutId,
      date: new Date(date),
      note,
      positions: {
        create: positions.map((p: { productId: string; x: number; y: number; rotation?: number; scale?: number }) => ({
          productId: p.productId,
          x: p.x,
          y: p.y,
          rotation: p.rotation ?? 0,
          scale: p.scale ?? 1.0,
        })),
      },
    },
    include: {
      positions: { include: { product: true } },
    },
  });

  res.status(201).json(snapshot);
});

// DELETE /api/snapshots/:id
router.delete('/:id', async (req, res) => {
  await prisma.snapshot.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
```

- [ ] **Step 8: Create server/routes/reports.ts**

```typescript
import { Router } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/reports/summary?layoutId=xxx&date=2026-08-10
router.get('/summary', async (req, res) => {
  const { layoutId, date } = req.query;
  if (!layoutId || !date) return res.status(400).json({ error: 'layoutId and date required' });

  const snapshot = await prisma.snapshot.findUnique({
    where: {
      layoutId_date: {
        layoutId: layoutId as string,
        date: new Date(date as string),
      },
    },
    include: {
      positions: { include: { product: true } },
      layout: true,
    },
  });

  if (!snapshot) return res.status(404).json({ error: 'No snapshot for this date' });

  const totalArea = snapshot.positions.reduce((sum, p) => sum + (p.product.areaM2 ?? 0), 0);
  const totalWeight = snapshot.positions.reduce((sum, p) => sum + (p.product.weightKg ?? 0), 0);
  const layoutArea = snapshot.layout.widthM * snapshot.layout.heightM;
  const usageRate = layoutArea > 0 ? (totalArea / layoutArea) * 100 : 0;

  res.json({
    snapshot,
    totalArea,
    totalWeight,
    layoutArea,
    usageRate: Math.round(usageRate * 10) / 10,
  });
});

// GET /api/reports/by-process?layoutId=xxx&date=2026-08-10
router.get('/by-process', async (req, res) => {
  const { layoutId, date } = req.query;
  if (!layoutId || !date) return res.status(400).json({ error: 'layoutId and date required' });

  const snapshot = await prisma.snapshot.findUnique({
    where: {
      layoutId_date: {
        layoutId: layoutId as string,
        date: new Date(date as string),
      },
    },
    include: {
      positions: { include: { product: true } },
      layout: true,
    },
  });

  if (!snapshot) return res.status(404).json({ error: 'No snapshot for this date' });

  const byProcess: Record<string, { count: number; totalArea: number; totalWeight: number }> = {};
  for (const pos of snapshot.positions) {
    const stage = pos.product.processStage ?? 'Khac';
    if (!byProcess[stage]) byProcess[stage] = { count: 0, totalArea: 0, totalWeight: 0 };
    byProcess[stage].count++;
    byProcess[stage].totalArea += pos.product.areaM2 ?? 0;
    byProcess[stage].totalWeight += pos.product.weightKg ?? 0;
  }

  const totalArea = Object.values(byProcess).reduce((s, v) => s + v.totalArea, 0);
  const result = Object.entries(byProcess).map(([stage, data]) => ({
    processStage: stage,
    ...data,
    areaPercent: totalArea > 0 ? Math.round((data.totalArea / totalArea) * 1000) / 10 : 0,
  }));

  res.json(result);
});

// GET /api/reports/occupation?projectId=xxx&layoutId=xxx
router.get('/occupation', async (req, res) => {
  const { projectId, layoutId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const where: Record<string, unknown> = { layout: { projectId: projectId as string } };
  if (layoutId) where.layoutId = layoutId as string;

  const snapshots = await prisma.snapshot.findMany({
    where,
    include: {
      positions: { include: { product: true } },
      layout: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  });

  // Build occupation periods per product per layout
  const periods: Array<{
    productName: string;
    productCode: string;
    layoutName: string;
    startDate: Date;
    endDate: Date;
    days: number;
    areaM2: number;
    areaDays: number;
  }> = [];

  const tracker: Record<string, { layoutName: string; startDate: Date; areaM2: number }> = {};

  for (const snap of snapshots) {
    const currentProducts = new Set<string>();

    for (const pos of snap.positions) {
      const key = `${pos.productId}__${snap.layoutId}`;
      currentProducts.add(key);

      if (!tracker[key]) {
        tracker[key] = {
          layoutName: snap.layout.name,
          startDate: snap.date,
          areaM2: pos.product.areaM2 ?? 0,
        };
      }
    }

    // Close periods for products no longer present
    for (const key of Object.keys(tracker)) {
      if (!currentProducts.has(key)) {
        const t = tracker[key];
        const days = Math.max(1, Math.round((snap.date.getTime() - t.startDate.getTime()) / 86400000));
        const [productId] = key.split('__');
        const product = snapshots
          .flatMap(s => s.positions)
          .find(p => p.productId === productId)?.product;

        periods.push({
          productName: product?.name ?? '',
          productCode: product?.code ?? '',
          layoutName: t.layoutName,
          startDate: t.startDate,
          endDate: snap.date,
          days,
          areaM2: t.areaM2,
          areaDays: Math.round(t.areaM2 * days * 10) / 10,
        });
        delete tracker[key];
      }
    }
  }

  // Close remaining open periods (still present at latest snapshot)
  const now = new Date();
  for (const [key, t] of Object.entries(tracker)) {
    const days = Math.max(1, Math.round((now.getTime() - t.startDate.getTime()) / 86400000));
    const [productId] = key.split('__');
    const product = snapshots
      .flatMap(s => s.positions)
      .find(p => p.productId === productId)?.product;

    periods.push({
      productName: product?.name ?? '',
      productCode: product?.code ?? '',
      layoutName: t.layoutName,
      startDate: t.startDate,
      endDate: now,
      days,
      areaM2: t.areaM2,
      areaDays: Math.round(t.areaM2 * days * 10) / 10,
    });
  }

  res.json(periods);
});

export default router;
```

- [ ] **Step 9: Add server start script to package.json**

Add to `scripts`:
```json
{
  "server": "tsx watch server/index.ts"
}
```

- [ ] **Step 10: Create uploads directory**

```bash
mkdir -p D:/3D/floor-manager/uploads/converted
```

- [ ] **Step 11: Start backend and verify**

```bash
cd D:/3D/floor-manager
npm run server
```

In another terminal, test with curl:
```bash
curl http://localhost:4000/api/projects
```

Expected: `[]` (empty array)

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add Express backend with REST API routes (projects, products, layouts, snapshots, reports)"
```

---

## Phase 2: Frontend CRUD Pages

### Task 4: App Shell & Navigation Layout

**Files:**
- Create: `floor-manager/src/components/AppLayout.tsx`
- Modify: `floor-manager/src/App.tsx`
- Create: `floor-manager/src/api/client.ts`
- Create: `floor-manager/src/pages/Dashboard.tsx`

- [ ] **Step 1: Create src/api/client.ts**

```typescript
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
```

- [ ] **Step 2: Create src/components/AppLayout.tsx**

```tsx
import { Layout, Menu } from 'antd';
import {
  ProjectOutlined,
  AppstoreOutlined,
  LayoutOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';

const { Sider, Content, Header } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { key: '/', icon: <ProjectOutlined />, label: 'Du an' },
    { key: '/products', icon: <AppstoreOutlined />, label: 'San pham' },
    { key: '/layouts', icon: <LayoutOutlined />, label: 'Mat bang' },
    { key: '/reports', icon: <BarChartOutlined />, label: 'Bao cao' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px', background: '#141414' }}>
        <div style={{ color: '#58a6ff', fontSize: 18, fontWeight: 700 }}>
          Floor Manager
        </div>
      </Header>
      <Layout>
        <Sider width={200} theme="dark">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />
        </Sider>
        <Content style={{ padding: 24, background: '#0d1117' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
```

- [ ] **Step 3: Create src/pages/Dashboard.tsx**

```tsx
import { useEffect, useState } from 'react';
import { Card, Button, Modal, Form, Input, Row, Col, Popconfirm, message, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setProjects(await api.getProjects());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (values: { name: string; description?: string }) => {
    if (editing) {
      await api.updateProject(editing.id, values);
      message.success('Da cap nhat du an');
    } else {
      await api.createProject(values);
      message.success('Da tao du an');
    }
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteProject(id);
    message.success('Da xoa du an');
    load();
  };

  if (loading) return <Spin size="large" />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ color: '#f0f6fc', margin: 0 }}>Du an cua toi</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
          Tao du an moi
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {projects.map((p) => (
          <Col xs={24} sm={12} lg={8} key={p.id}>
            <Card
              hoverable
              onClick={() => navigate(`/project/${p.id}`)}
              actions={[
                <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); setEditing(p); form.setFieldsValue(p); setModalOpen(true); }} />,
                <Popconfirm title="Xoa du an?" onConfirm={(e) => { e?.stopPropagation(); handleDelete(p.id); }} onCancel={(e) => e?.stopPropagation()}>
                  <DeleteOutlined key="delete" onClick={(e) => e.stopPropagation()} />
                </Popconfirm>,
              ]}
            >
              <Card.Meta
                title={p.name}
                description={p.description || 'Khong co mo ta'}
              />
              <div style={{ marginTop: 12, fontSize: 12, color: '#8b949e' }}>
                {p._count?.layouts ?? 0} mat bang | {p._count?.products ?? 0} san pham
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal
        title={editing ? 'Sua du an' : 'Tao du an moi'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Ten du an" rules={[{ required: true, message: 'Nhap ten du an' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Mo ta">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Update src/App.tsx with routes**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
```

- [ ] **Step 5: Verify in browser**

Start both servers:
```bash
# Terminal 1
npm run server
# Terminal 2
npm run dev
```

Open http://localhost:3000 — should see Dashboard with "Du an cua toi" header and "+ Tao du an moi" button. Create a project, verify it appears.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add app shell, navigation, Dashboard page with project CRUD"
```

---

### Task 5: Products Management Page

**Files:**
- Create: `floor-manager/src/pages/Products.tsx`
- Create: `floor-manager/src/pages/ProjectDetail.tsx`
- Modify: `floor-manager/src/App.tsx`

- [ ] **Step 1: Create src/pages/ProjectDetail.tsx**

```tsx
import { useEffect, useState } from 'react';
import { useParams, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Tabs, Spin } from 'antd';
import { api } from '@/api/client';

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (projectId) api.getProject(projectId).then(setProject);
  }, [projectId]);

  if (!project) return <Spin size="large" />;

  const activeTab = location.pathname.includes('/products') ? 'products'
    : location.pathname.includes('/layouts') ? 'layouts'
    : location.pathname.includes('/reports') ? 'reports'
    : 'products';

  return (
    <div>
      <h2 style={{ color: '#f0f6fc', marginBottom: 16 }}>{project.name}</h2>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => navigate(`/project/${projectId}/${key}`)}
        items={[
          { key: 'products', label: 'San pham' },
          { key: 'layouts', label: 'Mat bang' },
          { key: 'reports', label: 'Bao cao' },
        ]}
      />
      <Outlet context={{ project, projectId }} />
    </div>
  );
}
```

- [ ] **Step 2: Create src/pages/Products.tsx**

```tsx
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, ColorPicker, Popconfirm, message, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useOutletContext } from 'react-router-dom';
import { api } from '@/api/client';

const PROCESS_STAGES = ['Han', 'Son', 'Lap rap', 'Cat', 'Uon', 'Khoan', 'Gia cong CNC', 'Khac'];
const PROCESS_COLORS: Record<string, string> = {
  Han: 'orange', Son: 'green', 'Lap rap': 'blue', Cat: 'magenta',
  Uon: 'purple', Khoan: 'cyan', 'Gia cong CNC': 'geekblue', Khac: 'default',
};

export default function Products() {
  const { projectId } = useOutletContext<{ projectId: string }>();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setProducts(await api.getProducts(projectId));
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const handleSave = async (values: any) => {
    const data = {
      ...values,
      projectId,
      color: typeof values.color === 'string' ? values.color : values.color?.toHexString?.() ?? '#58a6ff',
    };
    if (editing) {
      await api.updateProduct(editing.id, data);
      message.success('Da cap nhat san pham');
    } else {
      await api.createProduct(data);
      message.success('Da tao san pham');
    }
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteProduct(id);
    message.success('Da xoa san pham');
    load();
  };

  const columns = [
    { title: 'Ma', dataIndex: 'code', width: 100 },
    {
      title: 'Ten san pham', dataIndex: 'name',
      render: (name: string, record: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: record.color }} />
          {name}
        </div>
      ),
    },
    { title: 'Khoi luong (kg)', dataIndex: 'weightKg', width: 130, render: (v: number) => v?.toLocaleString() ?? '-' },
    { title: 'Dien tich (m2)', dataIndex: 'areaM2', width: 130, render: (v: number) => v ?? '-' },
    {
      title: 'Cong doan', dataIndex: 'processStage', width: 120,
      render: (v: string) => v ? <Tag color={PROCESS_COLORS[v] || 'default'}>{v}</Tag> : '-',
    },
    {
      title: 'Loai', dataIndex: 'category', width: 100,
      render: (v: string) => v === 'thiet_bi' ? 'Thiet bi' : 'San pham',
    },
    {
      title: '', width: 80,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <EditOutlined onClick={() => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); }} />
          <Popconfirm title="Xoa san pham?" onConfirm={() => handleDelete(record.id)}>
            <DeleteOutlined />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
          Them san pham
        </Button>
      </div>

      <Table dataSource={products} columns={columns} rowKey="id" loading={loading} size="small" />

      <Modal
        title={editing ? 'Sua san pham' : 'Them san pham'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ category: 'san_pham', color: '#58a6ff' }}>
          <Form.Item name="name" label="Ten" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="code" label="Ma san pham" rules={[{ required: true }]}><Input /></Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="weightKg" label="Khoi luong (kg)" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="areaM2" label="Dien tich (m2)" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="processStage" label="Cong doan" style={{ flex: 1 }}>
              <Select options={PROCESS_STAGES.map(s => ({ label: s, value: s }))} allowClear />
            </Form.Item>
            <Form.Item name="category" label="Loai" style={{ flex: 1 }}>
              <Select options={[{ label: 'San pham', value: 'san_pham' }, { label: 'Thiet bi', value: 'thiet_bi' }]} />
            </Form.Item>
          </div>
          <Form.Item name="color" label="Mau sac"><ColorPicker /></Form.Item>
          <Form.Item name="sharepointLink" label="SharePoint link"><Input placeholder="https://..." /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 3: Update App.tsx with new routes**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Products from './pages/Products';

function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/project/:projectId" element={<ProjectDetail />}>
              <Route index element={<Navigate to="products" replace />} />
              <Route path="products" element={<Products />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
```

- [ ] **Step 4: Verify in browser**

- Go to Dashboard, create a project, click into it
- Should see Products tab, add a product with name/code/weight/area/process stage
- Verify CRUD works (create, edit, delete)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ProjectDetail page and Products CRUD with table, form, process stage tags"
```

---

## Phase 3: 2D Layout Editor

### Task 6: Layout Canvas Foundation

**Files:**
- Create: `floor-manager/src/pages/LayoutEditor.tsx`
- Create: `floor-manager/src/components/canvas/LayoutCanvas.tsx`
- Create: `floor-manager/src/components/canvas/GridLayer.tsx`
- Modify: `floor-manager/src/App.tsx`

- [ ] **Step 1: Install Konva dependencies**

```bash
cd D:/3D/floor-manager
npm install konva react-konva
```

- [ ] **Step 2: Create src/components/canvas/GridLayer.tsx**

```tsx
import { Line, Text } from 'react-konva';

interface GridLayerProps {
  width: number;
  height: number;
  gridSize: number; // in meters
  scale: number;    // pixels per meter
}

export default function GridLayer({ width, height, gridSize, scale }: GridLayerProps) {
  const lines = [];
  const labels = [];
  const step = gridSize * scale;
  const majorEvery = 5; // major line every 5 grid lines

  // Vertical lines
  for (let i = 0; i <= width / step; i++) {
    const x = i * step;
    const isMajor = i % majorEvery === 0;
    lines.push(
      <Line
        key={`v-${i}`}
        points={[x, 0, x, height]}
        stroke={isMajor ? '#30363d' : '#21262d'}
        strokeWidth={isMajor ? 1 : 0.5}
      />
    );
    if (isMajor) {
      labels.push(
        <Text key={`vl-${i}`} x={x + 2} y={2} text={`${(i * gridSize).toFixed(0)}m`} fill="#484f58" fontSize={10} />
      );
    }
  }

  // Horizontal lines
  for (let i = 0; i <= height / step; i++) {
    const y = i * step;
    const isMajor = i % majorEvery === 0;
    lines.push(
      <Line
        key={`h-${i}`}
        points={[0, y, width, y]}
        stroke={isMajor ? '#30363d' : '#21262d'}
        strokeWidth={isMajor ? 1 : 0.5}
      />
    );
    if (isMajor) {
      labels.push(
        <Text key={`hl-${i}`} x={2} y={y + 2} text={`${(i * gridSize).toFixed(0)}m`} fill="#484f58" fontSize={10} />
      );
    }
  }

  return (
    <>
      {lines}
      {labels}
    </>
  );
}
```

- [ ] **Step 3: Create src/components/canvas/LayoutCanvas.tsx**

```tsx
import { useRef, useState, useCallback } from 'react';
import { Stage, Layer } from 'react-konva';
import type Konva from 'konva';
import GridLayer from './GridLayer';

interface LayoutCanvasProps {
  widthM: number;
  heightM: number;
  gridSize: number;
  children?: React.ReactNode;
}

const INITIAL_SCALE = 10; // 10 pixels per meter

export default function LayoutCanvas({ widthM, heightM, gridSize, children }: LayoutCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const [stagePos, setStagePos] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);

  const canvasWidth = widthM * INITIAL_SCALE;
  const canvasHeight = heightM * INITIAL_SCALE;

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = zoom;
    const pointer = stage.getPointerPosition()!;
    const newScale = e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1;
    const clampedScale = Math.max(0.1, Math.min(5, newScale));

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };

    setZoom(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  }, [zoom, stagePos]);

  return (
    <div style={{ flex: 1, background: '#0d1117', overflow: 'hidden' }}>
      <Stage
        ref={stageRef}
        width={window.innerWidth - 480}
        height={window.innerHeight - 180}
        scaleX={zoom}
        scaleY={zoom}
        x={stagePos.x}
        y={stagePos.y}
        draggable
        onWheel={handleWheel}
        onDragEnd={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}
      >
        <Layer>
          <GridLayer
            width={canvasWidth}
            height={canvasHeight}
            gridSize={gridSize}
            scale={INITIAL_SCALE}
          />
        </Layer>
        <Layer>{children}</Layer>
      </Stage>
    </div>
  );
}
```

- [ ] **Step 4: Create src/pages/LayoutEditor.tsx (basic shell)**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spin } from 'antd';
import { api } from '@/api/client';
import LayoutCanvas from '@/components/canvas/LayoutCanvas';

export default function LayoutEditor() {
  const { layoutId } = useParams<{ layoutId: string }>();
  const [layout, setLayout] = useState<any>(null);

  useEffect(() => {
    if (layoutId) api.getLayout(layoutId).then(setLayout);
  }, [layoutId]);

  if (!layout) return <Spin size="large" />;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 112px)', overflow: 'hidden' }}>
      <LayoutCanvas widthM={layout.widthM} heightM={layout.heightM} gridSize={layout.gridSize} />
    </div>
  );
}
```

- [ ] **Step 5: Add route to App.tsx**

Add inside the AppLayout Route:
```tsx
<Route path="/project/:projectId/layout/:layoutId" element={<LayoutEditor />} />
```

- [ ] **Step 6: Verify canvas renders**

Create a layout via API/DB with widthM=100, heightM=60, then navigate to `/project/{id}/layout/{layoutId}`. Should see grid with meter labels, zoom with scroll wheel, pan by dragging.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add 2D layout canvas with grid, zoom, and pan"
```

---

### Task 7: Product Blocks (Drag & Drop)

**Files:**
- Create: `floor-manager/src/components/canvas/ProductBlock.tsx`
- Create: `floor-manager/src/components/panels/ProductPanel.tsx`
- Create: `floor-manager/src/components/panels/PropertyPanel.tsx`
- Modify: `floor-manager/src/pages/LayoutEditor.tsx`

- [ ] **Step 1: Create src/components/canvas/ProductBlock.tsx**

```tsx
import { Rect, Text, Group } from 'react-konva';
import type Konva from 'konva';

interface ProductBlockProps {
  id: string;
  name: string;
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  rotation: number;
  selected: boolean;
  gridSize: number;
  scale: number; // pixels per meter
  onSelect: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
}

export default function ProductBlock({
  id, name, x, y, width, height, color, rotation,
  selected, gridSize, scale, onSelect, onDragEnd,
}: ProductBlockProps) {
  const pxW = width * scale;
  const pxH = height * scale;
  const pxX = x * scale;
  const pxY = y * scale;
  const snapStep = gridSize * scale;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Snap to grid
    const snappedX = Math.round(e.target.x() / snapStep) * snapStep;
    const snappedY = Math.round(e.target.y() / snapStep) * snapStep;
    e.target.x(snappedX);
    e.target.y(snappedY);
    onDragEnd(id, snappedX / scale, snappedY / scale);
  };

  return (
    <Group
      x={pxX}
      y={pxY}
      rotation={rotation}
      draggable
      onClick={() => onSelect(id)}
      onTap={() => onSelect(id)}
      onDragEnd={handleDragEnd}
    >
      <Rect
        width={pxW}
        height={pxH}
        fill={color + '25'}
        stroke={selected ? '#58a6ff' : color}
        strokeWidth={selected ? 2 : 1.5}
        cornerRadius={2}
      />
      <Text
        text={name}
        width={pxW}
        height={pxH}
        align="center"
        verticalAlign="middle"
        fill={color}
        fontSize={11}
        fontStyle="bold"
      />
    </Group>
  );
}
```

- [ ] **Step 2: Create src/components/panels/ProductPanel.tsx**

```tsx
interface ProductPanelProps {
  products: any[];
  placedIds: Set<string>;
  onAddToCanvas: (product: any) => void;
}

export default function ProductPanel({ products, placedIds, onAddToCanvas }: ProductPanelProps) {
  return (
    <div style={{ width: 220, background: '#161b22', borderRight: '1px solid #30363d', overflowY: 'auto' }}>
      <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', borderBottom: '1px solid #21262d' }}>
        San pham (keo tha)
      </div>
      {products.map((p) => (
        <div
          key={p.id}
          onClick={() => !placedIds.has(p.id) && onAddToCanvas(p)}
          style={{
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: placedIds.has(p.id) ? 'default' : 'pointer',
            opacity: placedIds.has(p.id) ? 0.4 : 1,
            borderBottom: '1px solid #21262d',
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: 3, background: p.color, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: '#e1e4e8' }}>{p.name}</div>
            <div style={{ fontSize: 11, color: '#8b949e' }}>
              {p.code} | {p.areaM2 ?? '?'}m2 | {p.processStage ?? '-'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create src/components/panels/PropertyPanel.tsx**

```tsx
interface PropertyPanelProps {
  product: any | null;
  position: { x: number; y: number; rotation: number } | null;
}

export default function PropertyPanel({ product, position }: PropertyPanelProps) {
  if (!product) {
    return (
      <div style={{ width: 260, background: '#161b22', borderLeft: '1px solid #30363d', padding: 16 }}>
        <div style={{ color: '#484f58', fontSize: 13 }}>Chon 1 block de xem thuoc tinh</div>
      </div>
    );
  }

  return (
    <div style={{ width: 260, background: '#161b22', borderLeft: '1px solid #30363d', overflowY: 'auto' }}>
      <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', borderBottom: '1px solid #21262d' }}>
        Thuoc tinh
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d' }}>
        <h4 style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>THONG TIN</h4>
        <Row label="Ten" value={product.name} />
        <Row label="Ma" value={product.code} />
        <Row label="Khoi luong" value={product.weightKg ? `${product.weightKg} kg` : '-'} />
        <Row label="Dien tich" value={product.areaM2 ? `${product.areaM2} m2` : '-'} />
        <Row label="Cong doan" value={product.processStage ?? '-'} />
        <Row label="Loai" value={product.category === 'thiet_bi' ? 'Thiet bi' : 'San pham'} />
      </div>

      {position && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d' }}>
          <h4 style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>VI TRI</h4>
          <Row label="X" value={`${position.x.toFixed(2)} m`} />
          <Row label="Y" value={`${position.y.toFixed(2)} m`} />
          <Row label="Rotation" value={`${position.rotation.toFixed(1)} deg`} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: '#8b949e' }}>{label}</span>
      <span style={{ color: '#e1e4e8', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 4: Update src/pages/LayoutEditor.tsx with panels and blocks**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Spin, message } from 'antd';
import { SaveOutlined, FilePdfOutlined } from '@ant-design/icons';
import { api } from '@/api/client';
import LayoutCanvas from '@/components/canvas/LayoutCanvas';
import ProductBlock from '@/components/canvas/ProductBlock';
import ProductPanel from '@/components/panels/ProductPanel';
import PropertyPanel from '@/components/panels/PropertyPanel';

interface BlockState {
  productId: string;
  product: any;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

const SCALE = 10; // pixels per meter

export default function LayoutEditor() {
  const { layoutId, projectId } = useParams<{ layoutId: string; projectId: string }>();
  const [layout, setLayout] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<BlockState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!layoutId || !projectId) return;
    Promise.all([
      api.getLayout(layoutId),
      api.getProducts(projectId),
    ]).then(([l, p]) => {
      setLayout(l);
      setProducts(p);
      // Load latest snapshot if exists
      if (l.snapshots?.[0]) {
        api.getSnapshot(l.snapshots[0].id).then((snap: any) => {
          setBlocks(snap.positions.map((pos: any) => ({
            productId: pos.productId,
            product: pos.product,
            x: pos.x,
            y: pos.y,
            rotation: pos.rotation,
            scale: pos.scale,
          })));
        });
      }
    });
  }, [layoutId, projectId]);

  const handleAddToCanvas = useCallback((product: any) => {
    setBlocks((prev) => [
      ...prev,
      {
        productId: product.id,
        product,
        x: 5,
        y: 5,
        rotation: 0,
        scale: 1,
      },
    ]);
  }, []);

  const handleDragEnd = useCallback((productId: string, x: number, y: number) => {
    setBlocks((prev) =>
      prev.map((b) => (b.productId === productId ? { ...b, x, y } : b))
    );
  }, []);

  const handleSaveSnapshot = async () => {
    if (!layoutId) return;
    const today = new Date().toISOString().split('T')[0];
    await api.saveSnapshot({
      layoutId,
      date: today,
      positions: blocks.map((b) => ({
        productId: b.productId,
        x: b.x,
        y: b.y,
        rotation: b.rotation,
        scale: b.scale,
      })),
    });
    message.success(`Da luu snapshot ngay ${today}`);
  };

  if (!layout) return <Spin size="large" />;

  const selectedBlock = blocks.find((b) => b.productId === selectedId);
  const placedIds = new Set(blocks.map((b) => b.productId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '8px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ color: '#58a6ff', fontWeight: 600 }}>{layout.name} ({layout.widthM}m x {layout.heightM}m)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveSnapshot}>Save Snapshot</Button>
          <Button icon={<FilePdfOutlined />}>Export PDF</Button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ProductPanel products={products} placedIds={placedIds} onAddToCanvas={handleAddToCanvas} />

        <LayoutCanvas widthM={layout.widthM} heightM={layout.heightM} gridSize={layout.gridSize}>
          {blocks.map((b) => (
            <ProductBlock
              key={b.productId}
              id={b.productId}
              name={b.product.name}
              code={b.product.code}
              x={b.x}
              y={b.y}
              width={Math.sqrt(b.product.areaM2 ?? 4)}
              height={Math.sqrt(b.product.areaM2 ?? 4)}
              color={b.product.color}
              rotation={b.rotation}
              selected={selectedId === b.productId}
              gridSize={layout.gridSize}
              scale={SCALE}
              onSelect={setSelectedId}
              onDragEnd={handleDragEnd}
            />
          ))}
        </LayoutCanvas>

        <PropertyPanel
          product={selectedBlock?.product ?? null}
          position={selectedBlock ? { x: selectedBlock.x, y: selectedBlock.y, rotation: selectedBlock.rotation } : null}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify in browser**

Navigate to a layout. Should see:
- Left panel with product list
- Center canvas with grid
- Click product in left panel → block appears on canvas
- Drag block → snaps to grid
- Click block → right panel shows properties
- "Save Snapshot" saves positions

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add 2D layout editor with product blocks, drag-drop, snap-to-grid, and panels"
```

---

### Task 8: Timeline Bar (Snapshot Navigation)

**Files:**
- Create: `floor-manager/src/components/panels/TimelineBar.tsx`
- Modify: `floor-manager/src/pages/LayoutEditor.tsx`

- [ ] **Step 1: Create src/components/panels/TimelineBar.tsx**

```tsx
interface TimelineBarProps {
  snapshots: Array<{ id: string; date: string }>;
  activeSnapshotId: string | null;
  onSelect: (snapshotId: string) => void;
}

export default function TimelineBar({ snapshots, activeSnapshotId, onSelect }: TimelineBarProps) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div style={{
      padding: '8px 16px', background: '#161b22', borderTop: '1px solid #30363d',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 12, color: '#8b949e', whiteSpace: 'nowrap' }}>Snapshot:</span>
      <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
        {snapshots.map((s) => {
          const dateStr = new Date(s.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          const isToday = s.date.startsWith(today);
          const isActive = s.id === activeSnapshotId;
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: isToday ? '#238636' : isActive ? '#1f3a5f' : '#21262d',
                color: isToday ? '#fff' : isActive ? '#58a6ff' : '#8b949e',
                border: isActive ? '1px solid #58a6ff' : '1px solid transparent',
              }}
            >
              {dateStr}{isToday ? ' (Hom nay)' : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update LayoutEditor.tsx to include timeline**

Add state:
```typescript
const [snapshots, setSnapshots] = useState<any[]>([]);
const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
```

In the useEffect after loading layout, also load snapshots:
```typescript
api.getSnapshots(layoutId).then((snaps) => {
  setSnapshots(snaps);
  if (snaps.length > 0) {
    setActiveSnapshotId(snaps[0].id);
  }
});
```

Add handler:
```typescript
const handleSelectSnapshot = async (snapshotId: string) => {
  const snap = await api.getSnapshot(snapshotId);
  setBlocks(snap.positions.map((pos: any) => ({
    productId: pos.productId,
    product: pos.product,
    x: pos.x,
    y: pos.y,
    rotation: pos.rotation,
    scale: pos.scale,
  })));
  setActiveSnapshotId(snapshotId);
  setSelectedId(null);
};
```

After handleSaveSnapshot succeeds, reload snapshots:
```typescript
const updatedSnaps = await api.getSnapshots(layoutId);
setSnapshots(updatedSnaps);
setActiveSnapshotId(updatedSnaps[0]?.id ?? null);
```

Add TimelineBar component at the bottom of the editor body (after the flex container with panels):
```tsx
<TimelineBar
  snapshots={snapshots}
  activeSnapshotId={activeSnapshotId}
  onSelect={handleSelectSnapshot}
/>
```

- [ ] **Step 3: Verify timeline works**

- Save snapshots for different dates (modify date in save call for testing)
- Click different dates in timeline → canvas loads that snapshot's positions
- Today's snapshot highlighted in green

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add timeline bar for navigating snapshots by date"
```

---

## Phase 4: 3D Viewer

### Task 9: 3D Viewer Page

**Files:**
- Create: `floor-manager/src/pages/Viewer3D.tsx`
- Create: `floor-manager/src/components/viewer3d/Scene.tsx`
- Create: `floor-manager/src/components/viewer3d/ProductModel.tsx`
- Modify: `floor-manager/src/App.tsx`

- [ ] **Step 1: Install Three.js dependencies**

```bash
cd D:/3D/floor-manager
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

- [ ] **Step 2: Create src/components/viewer3d/ProductModel.tsx**

```tsx
import { useRef, useState } from 'react';
import { Box, Text3D, Center } from '@react-three/drei';
import type { Mesh } from 'three';

interface ProductModelProps {
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  selected: boolean;
  onClick: () => void;
}

export default function ProductModel({
  name, x, y, width, depth, height, color, selected, onClick,
}: ProductModelProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  return (
    <group position={[x, height / 2, y]}>
      <Box
        ref={meshRef}
        args={[width, height, depth]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={hovered || selected ? 0.8 : 0.5}
          wireframe={false}
        />
      </Box>
      {selected && (
        <lineSegments>
          <edgesGeometry args={[new (await import('three')).BoxGeometry(width, height, depth)]} />
          <lineBasicMaterial color="#58a6ff" linewidth={2} />
        </lineSegments>
      )}
    </group>
  );
}
```

Wait — that dynamic import won't work cleanly. Let me fix:

- [ ] **Step 2 (revised): Create src/components/viewer3d/ProductModel.tsx**

```tsx
import { useRef, useState, useMemo } from 'react';
import { Box } from '@react-three/drei';
import * as THREE from 'three';
import type { Mesh } from 'three';

interface ProductModelProps {
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  selected: boolean;
  onClick: () => void;
}

export default function ProductModel({
  name, x, y, width, depth, height, color, selected, onClick,
}: ProductModelProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const edges = useMemo(() => {
    if (!selected) return null;
    const geo = new THREE.BoxGeometry(width, height, depth);
    return new THREE.EdgesGeometry(geo);
  }, [selected, width, height, depth]);

  return (
    <group position={[x, height / 2, y]}>
      <Box
        ref={meshRef}
        args={[width, height, depth]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={hovered || selected ? 0.8 : 0.5}
        />
      </Box>
      {edges && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#58a6ff" />
        </lineSegments>
      )}
    </group>
  );
}
```

- [ ] **Step 3: Create src/components/viewer3d/Scene.tsx**

```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import ProductModel from './ProductModel';

interface SceneBlock {
  productId: string;
  name: string;
  x: number;
  y: number;
  areaM2: number;
  color: string;
}

interface SceneProps {
  blocks: SceneBlock[];
  widthM: number;
  heightM: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function Scene({ blocks, widthM, heightM, selectedId, onSelect }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [widthM / 2, widthM * 0.6, heightM], fov: 50 }}
      style={{ background: '#0a0e14' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[50, 80, 50]} intensity={1} />

      <Grid
        args={[widthM, heightM]}
        position={[widthM / 2, 0, heightM / 2]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#21262d"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#30363d"
        fadeDistance={200}
        infiniteGrid={false}
      />

      {blocks.map((b) => {
        const side = Math.sqrt(b.areaM2 || 4);
        return (
          <ProductModel
            key={b.productId}
            name={b.name}
            x={b.x}
            y={b.y}
            width={side}
            depth={side}
            height={side * 0.5}
            color={b.color}
            selected={selectedId === b.productId}
            onClick={() => onSelect(b.productId)}
          />
        );
      })}

      <OrbitControls target={[widthM / 2, 0, heightM / 2]} />

      <GizmoHelper alignment="bottom-left" margin={[60, 60]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.8} />
      </GizmoHelper>
    </Canvas>
  );
}
```

- [ ] **Step 4: Create src/pages/Viewer3D.tsx**

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '@/api/client';
import Scene from '@/components/viewer3d/Scene';
import PropertyPanel from '@/components/panels/PropertyPanel';

export default function Viewer3D() {
  const { layoutId, projectId } = useParams<{ layoutId: string; projectId: string }>();
  const navigate = useNavigate();
  const [layout, setLayout] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!layoutId) return;
    api.getLayout(layoutId).then((l) => {
      setLayout(l);
      if (l.snapshots?.[0]) {
        api.getSnapshot(l.snapshots[0].id).then((snap: any) => {
          setBlocks(snap.positions.map((pos: any) => ({
            productId: pos.productId,
            name: pos.product.name,
            x: pos.x,
            y: pos.y,
            areaM2: pos.product.areaM2,
            color: pos.product.color,
            product: pos.product,
            rotation: pos.rotation,
          })));
        });
      }
    });
  }, [layoutId]);

  if (!layout) return <Spin size="large" />;

  const selectedBlock = blocks.find((b) => b.productId === selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)' }}>
      <div style={{ padding: '8px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/project/${projectId}/layout/${layoutId}`)}>
            Quay lai 2D
          </Button>
          <span style={{ color: '#58a6ff', fontWeight: 600 }}>{layout.name} - 3D Viewer</span>
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1 }}>
        <div style={{ flex: 1 }}>
          <Scene
            blocks={blocks}
            widthM={layout.widthM}
            heightM={layout.heightM}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <PropertyPanel
          product={selectedBlock?.product ?? null}
          position={selectedBlock ? { x: selectedBlock.x, y: selectedBlock.y, rotation: selectedBlock.rotation } : null}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add route to App.tsx**

```tsx
<Route path="/project/:projectId/layout/:layoutId/3d" element={<Viewer3D />} />
```

- [ ] **Step 6: Add "View 3D" button in LayoutEditor toolbar**

In LayoutEditor.tsx, update the "View 3D" button:
```tsx
<Button onClick={() => navigate(`/project/${projectId}/layout/${layoutId}/3d`)}>View 3D</Button>
```

- [ ] **Step 7: Verify 3D viewer**

Navigate to 3D view from layout editor. Should see:
- 3D grid floor
- Product blocks as colored boxes at correct positions
- Orbit controls (drag to rotate, scroll to zoom)
- Click block → selected with blue edges
- Right panel shows properties

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add 3D viewer with Three.js, orbit controls, product blocks, and selection"
```

---

## Phase 5: Reports & PDF Export

### Task 10: Reports Page

**Files:**
- Create: `floor-manager/src/pages/Reports.tsx`
- Modify: `floor-manager/src/App.tsx`

- [ ] **Step 1: Create src/pages/Reports.tsx**

```tsx
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Tabs, Table, Select, DatePicker, Card, Statistic, Row, Col, Tag, Button, message } from 'antd';
import { FilePdfOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/api/client';

const PROCESS_COLORS: Record<string, string> = {
  Han: 'orange', Son: 'green', 'Lap rap': 'blue', Cat: 'magenta',
  Uon: 'purple', Khoan: 'cyan', Khac: 'default',
};

export default function Reports() {
  const { projectId, project } = useOutletContext<{ projectId: string; project: any }>();
  const [layouts, setLayouts] = useState<any[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [summary, setSummary] = useState<any>(null);
  const [byProcess, setByProcess] = useState<any[]>([]);
  const [occupation, setOccupation] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('summary');

  useEffect(() => {
    api.getLayouts(projectId).then((l) => {
      setLayouts(l);
      if (l.length > 0) setSelectedLayout(l[0].id);
    });
  }, [projectId]);

  useEffect(() => {
    if (!selectedLayout) return;
    const date = selectedDate.format('YYYY-MM-DD');
    if (activeTab === 'summary') {
      api.getReportSummary(selectedLayout, date).then(setSummary).catch(() => setSummary(null));
    } else if (activeTab === 'process') {
      api.getReportByProcess(selectedLayout, date).then(setByProcess).catch(() => setByProcess([]));
    } else if (activeTab === 'occupation') {
      api.getReportOccupation(projectId, selectedLayout).then(setOccupation).catch(() => setOccupation([]));
    }
  }, [selectedLayout, selectedDate, activeTab, projectId]);

  const summaryColumns = [
    { title: 'STT', render: (_: any, __: any, i: number) => i + 1, width: 50 },
    { title: 'San pham', dataIndex: ['product', 'name'] },
    { title: 'Ma', dataIndex: ['product', 'code'], width: 100 },
    { title: 'Vi tri (X, Y)', render: (_: any, r: any) => `${r.x.toFixed(1)}, ${r.y.toFixed(1)}`, width: 120 },
    { title: 'Dien tich (m2)', dataIndex: ['product', 'areaM2'], width: 120 },
    { title: 'Khoi luong (kg)', dataIndex: ['product', 'weightKg'], width: 130 },
    {
      title: 'Cong doan', dataIndex: ['product', 'processStage'], width: 100,
      render: (v: string) => v ? <Tag color={PROCESS_COLORS[v]}>{v}</Tag> : '-',
    },
  ];

  const processColumns = [
    { title: 'Cong doan', dataIndex: 'processStage', render: (v: string) => <Tag color={PROCESS_COLORS[v]}>{v}</Tag> },
    { title: 'So san pham', dataIndex: 'count', width: 120 },
    { title: 'Tong dien tich (m2)', dataIndex: 'totalArea', width: 150, render: (v: number) => v.toFixed(1) },
    { title: 'Tong khoi luong (kg)', dataIndex: 'totalWeight', width: 160, render: (v: number) => v.toFixed(1) },
    { title: 'Ty le dien tich (%)', dataIndex: 'areaPercent', width: 150, render: (v: number) => `${v}%` },
  ];

  const occupationColumns = [
    { title: 'San pham', dataIndex: 'productName' },
    { title: 'Ma', dataIndex: 'productCode', width: 100 },
    { title: 'Layout', dataIndex: 'layoutName', width: 120 },
    { title: 'Tu ngay', dataIndex: 'startDate', width: 100, render: (v: string) => dayjs(v).format('DD/MM') },
    { title: 'Den ngay', dataIndex: 'endDate', width: 100, render: (v: string) => dayjs(v).format('DD/MM') },
    { title: 'So ngay', dataIndex: 'days', width: 80 },
    { title: 'Dien tich (m2)', dataIndex: 'areaM2', width: 120 },
    { title: 'm2 x ngay', dataIndex: 'areaDays', width: 100 },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <Select
          style={{ width: 200 }}
          placeholder="Chon mat bang"
          value={selectedLayout}
          onChange={setSelectedLayout}
          options={layouts.map((l: any) => ({ label: l.name, value: l.id }))}
        />
        <DatePicker value={selectedDate} onChange={(d) => d && setSelectedDate(d)} />
        <Button icon={<FilePdfOutlined />} onClick={() => message.info('PDF export - se bo sung')}>
          Xuat PDF
        </Button>
      </div>

      {summary && activeTab === 'summary' && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="San pham" value={summary.snapshot.positions.length} /></Card></Col>
          <Col span={6}><Card><Statistic title="Tong DT chiem (m2)" value={summary.totalArea} precision={1} /></Card></Col>
          <Col span={6}><Card><Statistic title="DT mat bang (m2)" value={summary.layoutArea} precision={1} /></Card></Col>
          <Col span={6}><Card><Statistic title="Ty le su dung (%)" value={summary.usageRate} precision={1} suffix="%" /></Card></Col>
        </Row>
      )}

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'summary', label: 'Tong hop mat bang',
          children: <Table dataSource={summary?.snapshot?.positions ?? []} columns={summaryColumns} rowKey="id" size="small" />,
        },
        {
          key: 'process', label: 'Theo cong doan',
          children: <Table dataSource={byProcess} columns={processColumns} rowKey="processStage" size="small" />,
        },
        {
          key: 'occupation', label: 'Thoi gian chiem dung',
          children: <Table dataSource={occupation} columns={occupationColumns} rowKey={(r) => `${r.productCode}-${r.startDate}`} size="small"
            summary={() => {
              const total = occupation.reduce((s, r) => s + r.areaDays, 0);
              return <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={7}>Tong m2 x ngay</Table.Summary.Cell><Table.Summary.Cell index={1}>{total.toFixed(1)}</Table.Summary.Cell></Table.Summary.Row>;
            }}
          />,
        },
      ]} />
    </div>
  );
}
```

- [ ] **Step 2: Install dayjs**

```bash
npm install dayjs
```

- [ ] **Step 3: Add route in App.tsx**

Inside the ProjectDetail route:
```tsx
<Route path="reports" element={<Reports />} />
```

- [ ] **Step 4: Verify reports page**

Navigate to a project's Reports tab. Select a layout and date. Should show:
- Summary stats cards (total products, area, usage rate)
- 3 report tabs with data tables
- Occupation report with m2*ngay totals

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Reports page with summary, by-process, and occupation reports"
```

---

### Task 11: PDF Export

**Files:**
- Create: `floor-manager/src/utils/pdf-export.ts`
- Modify: `floor-manager/src/pages/LayoutEditor.tsx`
- Modify: `floor-manager/src/pages/Reports.tsx`

- [ ] **Step 1: Install jsPDF**

```bash
cd D:/3D/floor-manager
npm install jspdf jspdf-autotable
npm install -D @types/jspdf
```

- [ ] **Step 2: Create src/utils/pdf-export.ts**

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LayoutPDFData {
  projectName: string;
  layoutName: string;
  date: string;
  canvasImage: string; // base64 PNG
  positions: Array<{
    name: string;
    code: string;
    x: number;
    y: number;
    areaM2: number;
    weightKg: number;
    processStage: string;
  }>;
  totalArea: number;
  layoutArea: number;
  usageRate: number;
}

export function exportLayoutPDF(data: LayoutPDFData) {
  const doc = new jsPDF('landscape', 'mm', 'a3');

  // Header
  doc.setFontSize(18);
  doc.text(data.projectName, 14, 20);
  doc.setFontSize(12);
  doc.text(`Mat bang: ${data.layoutName} | Ngay: ${data.date}`, 14, 28);

  // Canvas image
  if (data.canvasImage) {
    doc.addImage(data.canvasImage, 'PNG', 14, 35, 380, 180);
  }

  // Table
  autoTable(doc, {
    startY: 220,
    head: [['STT', 'San pham', 'Ma', 'Vi tri (X,Y)', 'DT (m2)', 'KL (kg)', 'Cong doan']],
    body: data.positions.map((p, i) => [
      i + 1,
      p.name,
      p.code,
      `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`,
      p.areaM2?.toFixed(1) ?? '-',
      p.weightKg?.toFixed(1) ?? '-',
      p.processStage ?? '-',
    ]),
    foot: [['', '', '', 'Tong', data.totalArea.toFixed(1), '', '']],
    theme: 'grid',
    styles: { fontSize: 9 },
  });

  // Footer stats
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.text(`Tong dien tich chiem: ${data.totalArea.toFixed(1)} m2 | Dien tich mat bang: ${data.layoutArea.toFixed(1)} m2 | Ty le su dung: ${data.usageRate.toFixed(1)}%`, 14, finalY);

  doc.save(`${data.layoutName}_${data.date}.pdf`);
}

interface ReportPDFData {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  footer?: (string | number)[];
}

export function exportReportPDF(data: ReportPDFData) {
  const doc = new jsPDF('landscape', 'mm', 'a4');

  doc.setFontSize(16);
  doc.text(data.title, 14, 20);

  autoTable(doc, {
    startY: 30,
    head: [data.headers],
    body: data.rows,
    foot: data.footer ? [data.footer] : undefined,
    theme: 'grid',
    styles: { fontSize: 9 },
  });

  doc.save(`${data.title.replace(/\s+/g, '_')}.pdf`);
}
```

- [ ] **Step 3: Wire up Export PDF in LayoutEditor.tsx**

Import and add the handler:
```typescript
import { exportLayoutPDF } from '@/utils/pdf-export';

const handleExportPDF = () => {
  const stage = document.querySelector('canvas') as HTMLCanvasElement;
  const canvasImage = stage ? stage.toDataURL('image/png') : '';

  exportLayoutPDF({
    projectName: 'Du an', // pass from context
    layoutName: layout.name,
    date: new Date().toISOString().split('T')[0],
    canvasImage,
    positions: blocks.map((b) => ({
      name: b.product.name,
      code: b.product.code,
      x: b.x,
      y: b.y,
      areaM2: b.product.areaM2 ?? 0,
      weightKg: b.product.weightKg ?? 0,
      processStage: b.product.processStage ?? '',
    })),
    totalArea: blocks.reduce((s, b) => s + (b.product.areaM2 ?? 0), 0),
    layoutArea: layout.widthM * layout.heightM,
    usageRate: 0, // calculated below
  });
  message.success('Da xuat PDF');
};
```

Update the Export PDF button:
```tsx
<Button icon={<FilePdfOutlined />} onClick={handleExportPDF}>Export PDF</Button>
```

- [ ] **Step 4: Wire up Export PDF in Reports.tsx**

Import and add handler:
```typescript
import { exportReportPDF } from '@/utils/pdf-export';

const handleExportPDF = () => {
  if (activeTab === 'summary' && summary) {
    exportReportPDF({
      title: `Tong hop mat bang - ${selectedDate.format('DD/MM/YYYY')}`,
      headers: ['STT', 'San pham', 'Ma', 'Vi tri', 'DT (m2)', 'KL (kg)', 'Cong doan'],
      rows: summary.snapshot.positions.map((p: any, i: number) => [
        i + 1, p.product.name, p.product.code,
        `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`,
        p.product.areaM2 ?? '-', p.product.weightKg ?? '-', p.product.processStage ?? '-',
      ]),
      footer: ['', '', '', 'Tong', summary.totalArea.toFixed(1), '', ''],
    });
  } else if (activeTab === 'process') {
    exportReportPDF({
      title: `Bao cao theo cong doan - ${selectedDate.format('DD/MM/YYYY')}`,
      headers: ['Cong doan', 'So SP', 'Tong DT (m2)', 'Tong KL (kg)', 'Ty le (%)'],
      rows: byProcess.map((p) => [p.processStage, p.count, p.totalArea.toFixed(1), p.totalWeight.toFixed(1), `${p.areaPercent}%`]),
    });
  } else if (activeTab === 'occupation') {
    exportReportPDF({
      title: 'Bao cao thoi gian chiem dung mat bang',
      headers: ['San pham', 'Ma', 'Layout', 'Tu ngay', 'Den ngay', 'So ngay', 'DT (m2)', 'm2*ngay'],
      rows: occupation.map((r) => [
        r.productName, r.productCode, r.layoutName,
        dayjs(r.startDate).format('DD/MM'), dayjs(r.endDate).format('DD/MM'),
        r.days, r.areaM2, r.areaDays,
      ]),
      footer: ['', '', '', '', '', '', 'Tong', occupation.reduce((s: number, r: any) => s + r.areaDays, 0).toFixed(1)],
    });
  }
  message.success('Da xuat PDF');
};
```

Update the button onClick to use `handleExportPDF`.

- [ ] **Step 5: Verify PDF export**

- From Layout Editor: click Export PDF → downloads PDF with canvas image + table
- From Reports: click Export PDF on each tab → downloads respective report PDF

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PDF export for layout snapshots and reports using jsPDF"
```

---

## Phase 6: Layout Management UI

### Task 12: Layout CRUD in ProjectDetail

**Files:**
- Create: `floor-manager/src/pages/Layouts.tsx`
- Modify: `floor-manager/src/App.tsx`

- [ ] **Step 1: Create src/pages/Layouts.tsx**

```tsx
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';

export default function Layouts() {
  const { projectId } = useOutletContext<{ projectId: string }>();
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setLayouts(await api.getLayouts(projectId));
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const handleSave = async (values: any) => {
    const data = { ...values, projectId };
    if (editing) {
      await api.updateLayout(editing.id, data);
      message.success('Da cap nhat mat bang');
    } else {
      await api.createLayout(data);
      message.success('Da tao mat bang');
    }
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteLayout(id);
    message.success('Da xoa mat bang');
    load();
  };

  const columns = [
    { title: 'Ten mat bang', dataIndex: 'name' },
    { title: 'Rong (m)', dataIndex: 'widthM', width: 100 },
    { title: 'Dai (m)', dataIndex: 'heightM', width: 100 },
    { title: 'Grid (m)', dataIndex: 'gridSize', width: 80 },
    { title: 'Snapshots', dataIndex: ['_count', 'snapshots'], width: 100 },
    {
      title: '', width: 120,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <EyeOutlined onClick={() => navigate(`/project/${projectId}/layout/${record.id}`)} />
          <EditOutlined onClick={() => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); }} />
          <Popconfirm title="Xoa mat bang?" onConfirm={() => handleDelete(record.id)}>
            <DeleteOutlined />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
          Tao mat bang
        </Button>
      </div>

      <Table dataSource={layouts} columns={columns} rowKey="id" loading={loading} size="small" />

      <Modal
        title={editing ? 'Sua mat bang' : 'Tao mat bang'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ gridSize: 1.0 }}>
          <Form.Item name="name" label="Ten mat bang" rules={[{ required: true }]}><Input /></Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="widthM" label="Chieu rong (m)" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="heightM" label="Chieu dai (m)" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </div>
          <Form.Item name="gridSize" label="Grid size (m)">
            <InputNumber style={{ width: '100%' }} min={0.1} step={0.5} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Add route in App.tsx**

Inside ProjectDetail route:
```tsx
<Route path="layouts" element={<Layouts />} />
```

- [ ] **Step 3: Verify**

Navigate to project → Layouts tab. Create a layout with name/width/height. Click eye icon → opens 2D editor.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Layouts CRUD page with table, create/edit/delete"
```

---

## Phase 7: CAD File Upload (Basic)

### Task 13: File Upload Endpoint & UI

**Files:**
- Create: `floor-manager/server/routes/files.ts`
- Create: `floor-manager/src/components/common/FileUploader.tsx`
- Modify: `floor-manager/server/index.ts`
- Modify: `floor-manager/src/pages/Products.tsx`

- [ ] **Step 1: Create server/routes/files.ts**

```typescript
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['.dwg', '.dxf', '.step', '.stp', '.ifc', '.glb', '.gltf', '.obj', '.png', '.jpg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported`));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

const router = Router();

// POST /api/files/upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    filename: req.file.filename,
    originalname: req.file.originalname,
    path: `/uploads/${req.file.filename}`,
    size: req.file.size,
  });
});

// GET /api/files/list
router.get('/list', (_req, res) => {
  const files = fs.readdirSync(uploadDir).map((f) => ({
    filename: f,
    path: `/uploads/${f}`,
    size: fs.statSync(path.join(uploadDir, f)).size,
  }));
  res.json(files);
});

export default router;
```

- [ ] **Step 2: Register files route in server/index.ts**

Add import and route:
```typescript
import filesRouter from './routes/files';
app.use('/api/files', filesRouter);
```

- [ ] **Step 3: Create src/components/common/FileUploader.tsx**

```tsx
import { Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';

interface FileUploaderProps {
  accept: string;
  onUploaded: (url: string) => void;
  label?: string;
}

export default function FileUploader({ accept, onUploaded, label }: FileUploaderProps) {
  const props: UploadProps = {
    name: 'file',
    action: '/api/files/upload',
    accept,
    showUploadList: false,
    onChange(info) {
      if (info.file.status === 'done') {
        const url = info.file.response.path;
        onUploaded(url);
        message.success(`${info.file.name} uploaded`);
      } else if (info.file.status === 'error') {
        message.error(`Upload that bai`);
      }
    },
  };

  return (
    <Upload {...props}>
      <Button icon={<UploadOutlined />}>{label ?? 'Upload'}</Button>
    </Upload>
  );
}
```

- [ ] **Step 4: Add file upload to Products form**

In Products.tsx, import FileUploader and add to the form:
```tsx
<Form.Item name="file2dUrl" label="File 2D (DWG/DXF)">
  <div style={{ display: 'flex', gap: 8 }}>
    <Input value={form.getFieldValue('file2dUrl')} readOnly placeholder="Chua co file" style={{ flex: 1 }} />
    <FileUploader accept=".dwg,.dxf" onUploaded={(url) => form.setFieldValue('file2dUrl', url)} />
  </div>
</Form.Item>
<Form.Item name="file3dUrl" label="File 3D (STEP/STP/IFC)">
  <div style={{ display: 'flex', gap: 8 }}>
    <Input value={form.getFieldValue('file3dUrl')} readOnly placeholder="Chua co file" style={{ flex: 1 }} />
    <FileUploader accept=".step,.stp,.ifc,.glb,.gltf" onUploaded={(url) => form.setFieldValue('file3dUrl', url)} />
  </div>
</Form.Item>
```

- [ ] **Step 5: Add file upload to api client**

Add to `api` object in client.ts:
```typescript
uploadFile: async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/files/upload`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
},
```

- [ ] **Step 6: Verify file upload**

In Products form, upload a DWG or STEP file. Verify:
- File saved to `uploads/` directory
- URL stored in product record
- File accessible via `http://localhost:4000/uploads/filename`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add file upload endpoint and FileUploader component for 2D/3D files"
```

---

## Summary of Tasks

| Phase | Task | Description |
|---|---|---|
| 1 | Task 1 | Project scaffold (Vite + React + TypeScript) |
| 1 | Task 2 | Database schema (Prisma + PostgreSQL + Docker) |
| 1 | Task 3 | Express backend with all API routes |
| 2 | Task 4 | App shell, navigation, Dashboard page |
| 2 | Task 5 | Products management page with CRUD |
| 3 | Task 6 | Layout canvas foundation (Konva.js grid/zoom/pan) |
| 3 | Task 7 | Product blocks drag-drop with snap + panels |
| 3 | Task 8 | Timeline bar for snapshot navigation |
| 4 | Task 9 | 3D viewer with Three.js |
| 5 | Task 10 | Reports page (3 report types) |
| 5 | Task 11 | PDF export (layout + reports) |
| 6 | Task 12 | Layout CRUD page |
| 7 | Task 13 | File upload endpoint + UI |

### Not included in this plan (future phases):
- **CAD conversion pipeline** (DWG→SVG, STEP→glTF via BullMQ workers) — requires ODA File Converter install
- **IFC parsing** (web-ifc WASM integration)
- **SharePoint integration** (Microsoft Graph API, needs Azure AD app registration)
- **Loading actual 3D models** (glTF/STEP) in 3D viewer instead of placeholder boxes
- **DWG background layer** in 2D canvas
- **Undo/Redo** in layout editor
- **Block rotation** UI (rotation handle on canvas)
- **Distance measurement** between blocks
- **Authentication & permissions**

These should be scoped as separate plans once the core app is working.
