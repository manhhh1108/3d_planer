import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

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
      where: { id: req.params.id },
      include: {
        snapshots: {
          orderBy: { date: 'desc' },
          take: 10,
        },
      },
    });
    if (!layout) return res.status(404).json({ error: 'Not found' });
    res.json(layout);
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
      where: { id: req.params.id },
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
    await prisma.layout.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
