import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET mở cho mọi người đăng nhập; mọi mutation chỉ ADMIN.
router.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireRole('ADMIN')(req, _res, next);
});

// GET / — mặc định chỉ active; ?all=1 trả cả inactive (cho trang admin)
router.get('/', async (req: Request, res: Response) => {
  try {
    const all = req.query.all === '1';
    const stages = await prisma.stage.findMany({
      where: all ? undefined : { active: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(stages);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST / — tạo công đoạn
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, color, order } = req.body as { name?: string; color?: string; order?: number };
    if (!name || !color) return res.status(400).json({ error: 'name và color bắt buộc' });
    const stage = await prisma.stage.create({
      data: { name, color, order: Number.isFinite(order) ? Number(order) : 0 },
    });
    res.status(201).json(stage);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /:id — sửa tên/màu/thứ tự/bật-tắt
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, color, order, active } = req.body as {
      name?: string; color?: string; order?: number; active?: boolean;
    };
    const stage = await prisma.stage.update({
      where: { id: String(req.params.id) },
      data: {
        ...(typeof name === 'string' && name.trim() !== '' ? { name } : {}),
        ...(typeof color === 'string' && color.trim() !== '' ? { color } : {}),
        ...(Number.isFinite(Number(order)) ? { order: Number(order) } : {}),
        ...(active !== undefined ? { active } : {}),
      },
    });
    res.json(stage);
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id — soft-delete (active=false), giữ lịch sử
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const stage = await prisma.stage.update({
      where: { id: String(req.params.id) },
      data: { active: false },
    });
    res.json(stage);
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: String(err) });
  }
});

export default router;
