import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

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
      where: { id: req.params.id },
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

// POST / — upsert snapshot by layoutId+date, manage positions
router.post('/', async (req: Request, res: Response) => {
  try {
    const { layoutId, date, note, positions } = req.body as {
      layoutId: string;
      date: string;
      note?: string;
      positions?: Array<{
        productId: string;
        x: number;
        y: number;
        rotation?: number;
        scale?: number;
        orientation?: string;
      }>;
    };

    const parsedDate = new Date(date);

    const snapshot = await prisma.snapshot.upsert({
      where: {
        layoutId_date: { layoutId, date: parsedDate },
      },
      update: {
        note,
        positions: {
          deleteMany: {},
          create: (positions ?? []).map((p) => ({
            productId: p.productId,
            x: p.x,
            y: p.y,
            rotation: p.rotation ?? 0,
            scale: p.scale ?? 1.0,
            orientation: p.orientation ?? 'bottom',
          })),
        },
      },
      create: {
        layoutId,
        date: parsedDate,
        note,
        positions: {
          create: (positions ?? []).map((p) => ({
            productId: p.productId,
            x: p.x,
            y: p.y,
            rotation: p.rotation ?? 0,
            scale: p.scale ?? 1.0,
            orientation: p.orientation ?? 'bottom',
          })),
        },
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
    await prisma.snapshot.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
