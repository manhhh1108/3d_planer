import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { layoutBgPaths } from '../cad/paths.js';
import { dxfToSvg } from '../cad/convertDxfSvg.js';
import { dwgToDxfText } from '../cad/convertDwg.js';

const router = Router();

const TMP_DIR = path.resolve(process.env.STORAGE_DIR || './storage', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({ dest: TMP_DIR, limits: { fileSize: 50 * 1024 * 1024 } });

/** Ảnh dùng làm nền mặt bằng — lưu nguyên bản, không qua bước dựng SVG như DXF */
const IMAGE_BG_EXTS = ['png', 'jpg', 'jpeg', 'webp'];

// Layout là mặt bằng thi công — người lập kế hoạch làm chủ nó: tạo, sửa kích
// thước, dựng tường, thay nền bản vẽ, xoá. Còn Site (nhà máy, kho bãi chứa các
// layout) vẫn chỉ ADMIN, xem routes/sites.ts.
router.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireRole('ADMIN', 'PLANNING')(req, _res, next);
});

/** Số tường tối đa cho một layout — chặn client gửi blob khổng lồ */
const MAX_WALLS = 5000;
// Một bản vẽ vài chục loại block là nhiều; giới hạn rộng tay để chặn payload rác
const MAX_BLOCK_MAP_ENTRIES = 500;

type StoredWall = {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
  height: number;
  color: string;
  curvePoint?: { x: number; y: number };
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function point(v: unknown): { x: number; y: number } | null {
  if (!v || typeof v !== 'object') return null;
  const x = num((v as Record<string, unknown>).x);
  const y = num((v as Record<string, unknown>).y);
  return x === null || y === null ? null : { x, y };
}

/**
 * Chuẩn hoá tường từ client. Trả về null nếu sai hình dạng — chỉ giữ đúng các
 * field đã biết để field lạ không lọt vào cột JSON.
 */
function normalizeWall(v: unknown): StoredWall | null {
  if (!v || typeof v !== 'object') return null;
  const w = v as Record<string, unknown>;
  const start = point(w.start);
  const end = point(w.end);
  const thickness = num(w.thickness);
  const height = num(w.height);
  if (!start || !end || thickness === null || height === null) return null;
  if (thickness <= 0 || height <= 0) return null;
  if (typeof w.id !== 'string' || !w.id) return null;
  if (typeof w.color !== 'string') return null;

  const out: StoredWall = { id: w.id, start, end, thickness, height, color: w.color };
  const curve = w.curvePoint === undefined || w.curvePoint === null ? null : point(w.curvePoint);
  if (w.curvePoint !== undefined && w.curvePoint !== null) {
    if (!curve) return null;
    out.curvePoint = curve;
  }
  return out;
}

/** Cột walls null (layout tạo trước khi có tính năng) hiện ra là mảng rỗng */
function withWalls<T extends { walls?: unknown }>(layout: T) {
  return { ...layout, walls: Array.isArray(layout.walls) ? layout.walls : [] };
}

// GET /?siteId=xxx — list layouts with snapshot count
router.get('/', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.query;
    const layouts = await prisma.layout.findMany({
      where: siteId ? { siteId: String(siteId) } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { snapshots: true } },
      },
    });
    res.json(layouts);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — single layout with last 10 snapshots ordered by date desc
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const layout = await prisma.layout.findUnique({
      where: { id: String(req.params.id) },
      include: {
        snapshots: {
          orderBy: { date: 'desc' },
          take: 10,
        },
      },
    });
    if (!layout) return res.status(404).json({ error: 'Not found' });
    res.json(withWalls(layout));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Khoá mềm: cho người vào sau biết ai đang chỉnh sửa.
 *
 * Không chặn xem, không chặn chỉnh sửa tại chỗ — chỉ chặn LƯU (xem
 * routes/snapshots.ts). Có hạn dùng nên không bao giờ kẹt khoá vì ai đó đóng
 * tab; client gia hạn định kỳ trong lúc còn mở editor.
 */
const LOCK_TTL_MS = 2 * 60 * 1000;

function parseLockDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Khoá còn hiệu lực, hoặc null nếu trống/đã hết hạn */
export async function activeLock(layoutId: string, date: Date) {
  const lock = await prisma.layoutLock.findUnique({
    where: { layoutId_date: { layoutId, date } },
  });
  if (!lock || lock.expiresAt <= new Date()) return null;
  return lock;
}

function serializeLock(lock: Awaited<ReturnType<typeof activeLock>>, meId: string | undefined) {
  if (!lock) return { locked: false, holder: null, mine: false };
  return {
    locked: true,
    mine: lock.userId === meId,
    holder: {
      userId: lock.userId,
      email: lock.userEmail,
      name: lock.userName,
      acquiredAt: lock.acquiredAt,
      expiresAt: lock.expiresAt,
    },
  };
}

// GET /:id/lock?date=YYYY-MM-DD — ai đang giữ khoá
router.get('/:id/lock', async (req: Request, res: Response) => {
  try {
    const date = parseLockDate(req.query.date);
    if (!date) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const lock = await activeLock(String(req.params.id), date);
    res.json(serializeLock(lock, req.user?.id));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /:id/lock — giành hoặc gia hạn khoá. Không cướp khoá của người khác.
router.put('/:id/lock', async (req: Request, res: Response) => {
  try {
    const layoutId = String(req.params.id);
    const date = parseLockDate((req.body as { date?: unknown })?.date);
    if (!date) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const layout = await prisma.layout.findUnique({ where: { id: layoutId }, select: { id: true } });
    if (!layout) return res.status(404).json({ error: 'Not found' });

    const me = req.user!;
    const current = await activeLock(layoutId, date);
    if (current && current.userId !== me.id) {
      // Người khác đang giữ — trả về trạng thái để client hiện cảnh báo,
      // không phải lỗi: người này vẫn được xem và chỉnh sửa tại chỗ.
      return res.json(serializeLock(current, me.id));
    }

    const user = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true } });
    const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
    const lock = await prisma.layoutLock.upsert({
      where: { layoutId_date: { layoutId, date } },
      update: { userId: me.id, userEmail: me.email, userName: user?.name ?? me.email, expiresAt },
      create: {
        layoutId, date,
        userId: me.id, userEmail: me.email, userName: user?.name ?? me.email,
        expiresAt,
      },
    });
    res.json(serializeLock(lock, me.id));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id/lock?date=YYYY-MM-DD — nhả khoá (chỉ người đang giữ)
router.delete('/:id/lock', async (req: Request, res: Response) => {
  try {
    const date = parseLockDate(req.query.date);
    if (!date) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const layoutId = String(req.params.id);
    const current = await activeLock(layoutId, date);
    if (current && current.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Khoá đang do người khác giữ' });
    }
    await prisma.layoutLock.deleteMany({ where: { layoutId, date } });
    res.json({ locked: false, holder: null, mine: false });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /:id/walls — thay toàn bộ tường của layout (mét)
router.put('/:id/walls', async (req: Request, res: Response) => {
  try {
    const raw = (req.body as Record<string, unknown> | undefined)?.walls;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ error: 'walls must be an array' });
    }
    if (raw.length > MAX_WALLS) {
      return res.status(400).json({ error: `Too many walls (max ${MAX_WALLS})` });
    }
    const walls: StoredWall[] = [];
    for (const [i, item] of raw.entries()) {
      const w = normalizeWall(item);
      if (!w) return res.status(400).json({ error: `Invalid wall at index ${i}` });
      walls.push(w);
    }

    const exists = await prisma.layout.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true },
    });
    if (!exists) return res.status(404).json({ error: 'Not found' });

    const layout = await prisma.layout.update({
      where: { id: String(req.params.id) },
      data: { walls },
    });
    res.json(withWalls(layout));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Mapping block DXF -> sản phẩm: object phẳng, khoá và giá trị đều là chuỗi */
function normalizeBlockMap(raw: unknown): Record<string, string> | null {
  if (raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [blockName, productId] of Object.entries(raw as Record<string, unknown>)) {
    if (!blockName || blockName.length > 255) return null;
    if (typeof productId !== 'string') return null;
    if (productId) out[blockName] = productId; // '' = bỏ qua block, không cần lưu
  }
  return out;
}

// PUT /:id/dxf-map — nhớ block DXF nào ứng với sản phẩm nào, để lần nhập sau
// không phải map lại từ đầu
router.put('/:id/dxf-map', async (req: Request, res: Response) => {
  try {
    const map = normalizeBlockMap((req.body as Record<string, unknown> | undefined)?.dxfBlockMap);
    if (!map) return res.status(400).json({ error: 'dxfBlockMap must be an object of string -> string' });
    if (Object.keys(map).length > MAX_BLOCK_MAP_ENTRIES) {
      return res.status(400).json({ error: `Too many entries (max ${MAX_BLOCK_MAP_ENTRIES})` });
    }

    const exists = await prisma.layout.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true },
    });
    if (!exists) return res.status(404).json({ error: 'Not found' });

    const layout = await prisma.layout.update({
      where: { id: String(req.params.id) },
      data: { dxfBlockMap: map },
    });
    res.json(withWalls(layout));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST / — create layout
router.post('/', async (req: Request, res: Response) => {
  try {
    const layout = await prisma.layout.create({ data: req.body });
    res.status(201).json(layout);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /:id — update layout
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const layout = await prisma.layout.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id — delete layout
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.layout.delete({ where: { id } });
    // Nền DXF và ảnh snapshot đều nằm dưới thư mục của layout — xoá cả cụm,
    // không thì mỗi layout bị xoá lại để lại một đống file mồ côi.
    const p = layoutBgPaths(id);
    fs.rmSync(p.artifactDir, { recursive: true, force: true });
    fs.rmSync(p.sourceDir, { recursive: true, force: true });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id/background/inserts — return INSERT entities from saved source DXF
router.get('/:id/background/inserts', async (req: Request, res: Response) => {
  try {
    const layout = await prisma.layout.findUnique({ where: { id: String(req.params.id) } });
    if (!layout) return res.status(404).json({ error: 'Layout not found' });
    if (!layout.backgroundFile) return res.status(404).json({ error: 'No background uploaded' });

    const p = layoutBgPaths(String(req.params.id));
    let dxfText: string;
    const dxfPath = p.sourceFile('dxf');
    const dwgPath = p.sourceFile('dwg');

    if (fs.existsSync(dxfPath)) {
      dxfText = fs.readFileSync(dxfPath, 'utf8');
    } else if (fs.existsSync(dwgPath)) {
      if (!process.env.ODA_CONVERTER_PATH) {
        return res.status(422).json({ error: 'DWG conversion requires ODA_CONVERTER_PATH to be set' });
      }
      dxfText = await dwgToDxfText(dwgPath);
    } else {
      return res.status(404).json({ error: 'Source file not found' });
    }

    const { inserts } = dxfToSvg(dxfText);
    res.json(inserts);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /:id/background — upload DXF/DWG as layout floor plan background
router.post('/:id/background', upload.single('file'), async (req: Request, res: Response) => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const isImage = IMAGE_BG_EXTS.includes(ext);
    if (!isImage && !['dxf', 'dwg'].includes(ext)) {
      return res.status(400).json({ error: 'Chỉ nhận file DXF, DWG hoặc ảnh PNG/JPG/WEBP' });
    }
    const layout = await prisma.layout.findUnique({ where: { id: String(req.params.id) } });
    if (!layout) return res.status(404).json({ error: 'Layout not found' });

    // Ảnh scan/chụp không mang tỉ lệ như bản vẽ CAD, nên không suy ra được kích
    // thước thật. Giữ nguyên widthM/heightM của layout và trải ảnh vừa khung đó
    // — lệch tỉ lệ thì người dùng sửa kích thước layout, còn hơn đoán bừa.
    if (isImage) {
      const p = layoutBgPaths(String(req.params.id));
      if (layout.backgroundFile) {
        fs.rmSync(p.artifactDir, { recursive: true, force: true });
        fs.rmSync(p.sourceDir, { recursive: true, force: true });
      }
      fs.mkdirSync(p.artifactDir, { recursive: true });
      fs.copyFileSync(req.file.path, p.bgImageFile(ext));

      const updated = await prisma.layout.update({
        where: { id: String(req.params.id) },
        // Ảnh mới thì cách căn cũ vô nghĩa — trả về mặc định để canh lại từ đầu
        data: { backgroundFile: p.bgImageUrl(ext), bgTransform: Prisma.DbNull },
      });
      return res.json(updated);
    }

    if (ext === 'dwg') {
      if (!process.env.ODA_CONVERTER_PATH) {
        return res.status(422).json({ error: 'DWG conversion requires ODA_CONVERTER_PATH to be set on the server' });
      }
    }

    const dxfText = ext === 'dwg'
      ? await dwgToDxfText(req.file.path)
      : fs.readFileSync(req.file.path, 'utf8');

    const { svg, widthM, heightM } = dxfToSvg(dxfText);

    const p = layoutBgPaths(String(req.params.id));
    if (layout.backgroundFile) {
      fs.rmSync(p.artifactDir, { recursive: true, force: true });
    }
    fs.mkdirSync(p.sourceDir, { recursive: true });
    fs.mkdirSync(p.artifactDir, { recursive: true });
    fs.copyFileSync(req.file.path, p.sourceFile(ext));
    fs.writeFileSync(p.bgFile, svg, 'utf8');

    const updated = await prisma.layout.update({
      where: { id: String(req.params.id) },
      data: { backgroundFile: p.bgUrl, widthM, heightM, bgTransform: Prisma.DbNull },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    if (tmpPath) fs.rmSync(tmpPath, { force: true });
  }
});

// DELETE /:id/background — remove layout floor plan background, preserve dimensions
router.delete('/:id/background', async (req: Request, res: Response) => {
  try {
    const layout = await prisma.layout.findUnique({ where: { id: String(req.params.id) } });
    if (!layout) return res.status(404).json({ error: 'Layout not found' });

    const p = layoutBgPaths(String(req.params.id));
    fs.rmSync(p.artifactDir, { recursive: true, force: true });

    const updated = await prisma.layout.update({
      where: { id: String(req.params.id) },
      data: { backgroundFile: null, bgTransform: Prisma.DbNull },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
