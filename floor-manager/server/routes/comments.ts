import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/comments?layoutId=xxx[&snapshotId=yyy]
router.get('/', async (req: Request, res: Response) => {
  const { layoutId, snapshotId } = req.query;
  if (!layoutId) return res.status(400).json({ error: 'layoutId là bắt buộc' });

  const where: Record<string, unknown> = { layoutId: String(layoutId) };
  if (snapshotId) where.snapshotId = String(snapshotId);

  try {
    const comments = await prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/comments — PLANNING hoặc ADMIN
router.post('/', requireRole('ADMIN', 'PLANNING'), async (req: Request, res: Response) => {
  try {
    const { layoutId, snapshotId, positionX, positionY, text } = req.body;
    if (!layoutId || !text) return res.status(400).json({ error: 'layoutId và text là bắt buộc' });

    const layout = await prisma.layout.findUnique({ where: { id: String(layoutId) } });
    if (!layout) return res.status(404).json({ error: 'Layout không tồn tại' });

    if (snapshotId) {
      const snapshot = await prisma.snapshot.findUnique({ where: { id: String(snapshotId) } });
      if (!snapshot || snapshot.layoutId !== String(layoutId)) {
        return res.status(400).json({ error: 'snapshotId không thuộc layout này' });
      }
    }

    const comment = await prisma.comment.create({
      data: {
        layoutId: String(layoutId),
        snapshotId: snapshotId ? String(snapshotId) : null,
        positionX: positionX !== undefined ? Number(positionX) : null,
        positionY: positionY !== undefined ? Number(positionY) : null,
        text: String(text),
        createdBy: req.user!.email,
      },
    });
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/comments/:id — chỉ tác giả hoặc ADMIN
router.put('/:id', requireRole('ADMIN', 'PLANNING'), async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text là bắt buộc' });

    const existing = await prisma.comment.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) return res.status(404).json({ error: 'Comment không tồn tại' });

    if (existing.createdBy !== req.user!.email && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Chỉ tác giả hoặc ADMIN mới sửa được' });
    }

    const comment = await prisma.comment.update({
      where: { id: String(req.params.id) },
      data: { text: String(text) },
    });
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/comments/:id — chỉ tác giả hoặc ADMIN
router.delete('/:id', requireRole('ADMIN', 'PLANNING'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.comment.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) return res.status(404).json({ error: 'Comment không tồn tại' });

    if (existing.createdBy !== req.user!.email && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Chỉ tác giả hoặc ADMIN mới xóa được' });
    }

    await prisma.comment.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
