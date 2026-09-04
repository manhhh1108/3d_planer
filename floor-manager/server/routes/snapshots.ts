import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { snapshotThumbPaths } from '../cad/paths.js';
import { activeLock } from './layouts.js';

const router = Router();

// Ảnh chụp canvas 300px — 2MB đã là rất rộng rãi
const thumbUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireRole('ADMIN', 'PLANNING')(req, _res, next);
});

// PUT /:id/thumbnail — ảnh xem trước mặt bằng, ghi đè tại chỗ
router.put('/:id/thumbnail', thumbUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    if (!['image/jpeg', 'image/png'].includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Thumbnail must be JPEG or PNG' });
    }

    const snapshot = await prisma.snapshot.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, layoutId: true },
    });
    if (!snapshot) return res.status(404).json({ error: 'Not found' });

    const p = snapshotThumbPaths(snapshot.layoutId, snapshot.id);
    fs.mkdirSync(p.dir, { recursive: true });
    fs.writeFileSync(p.file, req.file.buffer);

    const updated = await prisma.snapshot.update({
      where: { id: snapshot.id },
      data: { thumbnail: p.url },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /?layoutId=xxx — list snapshots ordered by date desc
router.get('/', async (req: Request, res: Response) => {
  try {
    const { layoutId } = req.query;
    const snapshots = await prisma.snapshot.findMany({
      where: layoutId ? { layoutId: String(layoutId) } : undefined,
      orderBy: { date: 'desc' },
    });
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — single snapshot with positions including product
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const snapshot = await prisma.snapshot.findUnique({
      where: { id: String(req.params.id) },
      include: {
        positions: {
          include: { product: true },
        },
      },
    });
    if (!snapshot) return res.status(404).json({ error: 'Not found' });
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

type IncomingPosition = {
  productId: string;
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
  orientation?: string;
  elevationM?: number;
};

/**
 * Khoá nhận dạng một block theo hình học, làm tròn tới mm.
 *
 * Mỗi lần lưu là xoá sạch positions rồi ghi lại, nên không có id bền để đối
 * chiếu. Nhưng hai block khác nhau không thể cùng sản phẩm VÀ cùng toạ độ, nên
 * hình học là khoá đủ tin cậy: khớp = block không bị đụng tới, giữ nguyên
 * người thao tác cũ; không khớp = vừa bị đặt hoặc di chuyển, ghi người hiện tại.
 */
function positionKey(p: {
  productId: string; x: number; y: number;
  rotation?: number | null; scale?: number | null;
  orientation?: string | null; elevationM?: number | null;
}): string {
  const r = (n: number | null | undefined, d = 0) => Math.round(((n ?? d) as number) * 1000);
  return [
    p.productId, r(p.x), r(p.y), r(p.rotation), r(p.scale, 1),
    p.orientation ?? 'bottom', r(p.elevationM),
  ].join('|');
}

// POST / — upsert snapshot by layoutId+date, manage positions
router.post('/', async (req: Request, res: Response) => {
  try {
    const { layoutId, date, note, positions, version, zones } = req.body as {
      layoutId: string;
      date: string;
      note?: string;
      version?: number;
      zones?: unknown;
      positions?: Array<{
        productId: string;
        x: number;
        y: number;
        rotation?: number;
        scale?: number;
        orientation?: string;
        elevationM?: number;
      }>;
    };

    const parsedDate = new Date(date);
    const me = req.user!;

    // Khoá mềm: người khác đang mở đúng (layout, ngày) này thì không cho lưu.
    // Họ vẫn xem và chỉnh sửa tại chỗ được — chỉ lưu là bị chặn.
    const lock = await activeLock(layoutId, parsedDate);
    if (lock && lock.userId !== me.id) {
      return res.status(423).json({
        error: `Đang được ${lock.userName} chỉnh sửa — chưa lưu được`,
        holder: { name: lock.userName, email: lock.userEmail, expiresAt: lock.expiresAt },
      });
    }

    const existing = await prisma.snapshot.findUnique({
      where: { layoutId_date: { layoutId, date: parsedDate } },
      include: { positions: true },
    });

    // If version is provided, check against existing snapshot for optimistic locking
    if (version !== undefined && existing && existing.version !== version) {
      return res.status(409).json({
        error: 'Dữ liệu đã được cập nhật bởi người khác. Vui lòng tải lại.',
        currentVersion: existing.version,
      });
    }

    // Block nào không đụng tới thì giữ nguyên người thao tác cũ
    const previous = new Map(existing?.positions.map((p) => [positionKey(p), p]) ?? []);
    const now = new Date();
    const withAuthor = ((positions ?? []) as IncomingPosition[]).map((p) => {
      const before = previous.get(positionKey(p));
      return {
        productId: p.productId,
        x: p.x,
        y: p.y,
        rotation: p.rotation ?? 0,
        scale: p.scale ?? 1.0,
        orientation: p.orientation ?? 'bottom',
        elevationM: Number.isFinite(p.elevationM) ? Number(p.elevationM) : 0,
        updatedBy: before?.updatedBy ?? me.email,
        updatedAt: before?.updatedAt ?? now,
      };
    });

    const snapshot = await prisma.snapshot.upsert({
      where: {
        layoutId_date: { layoutId, date: parsedDate },
      },
      update: {
        note,
        zones: (zones ?? undefined) as any,
        version: { increment: 1 },
        positions: { deleteMany: {}, create: withAuthor },
      },
      create: {
        layoutId,
        date: parsedDate,
        note,
        zones: (zones ?? undefined) as any,
        createdBy: req.user!.email,
        positions: { create: withAuthor },
      },
      include: {
        positions: { include: { product: true } },
      },
    });

    res.status(201).json(snapshot);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id — delete snapshot
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.snapshot.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
