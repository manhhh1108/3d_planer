import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireRole('ADMIN')(req, _res, next);
});

// GET / — list sites with layout counts
router.get('/', async (_req: Request, res: Response) => {
  try {
    const sites = await prisma.site.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { layouts: true } } },
    });
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — single site with layouts (+ snapshot counts)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const site = await prisma.site.findUnique({
      where: { id: String(req.params.id) },
      include: {
        layouts: {
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { snapshots: true } },
            // Thẻ layout hiện ảnh xem trước của lần lưu gần nhất
            snapshots: {
              orderBy: { date: 'desc' },
              take: 1,
              select: { id: true, date: true, thumbnail: true },
            },
          },
        },
      },
    });
    if (!site) return res.status(404).json({ error: 'Not found' });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST / — create site
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, address } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const site = await prisma.site.create({
      data: { name: String(name).trim(), address },
    });
    res.status(201).json(site);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /:id — update site
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, address, active } = req.body;
    const site = await prisma.site.update({
      where: { id: String(req.params.id) },
      data: { name, address, active },
    });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id — refuse when site still has layouts
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const layoutCount = await prisma.layout.count({
      where: { siteId: String(req.params.id) },
    });
    if (layoutCount > 0) {
      return res.status(409).json({ error: 'Site has layouts — delete them first' });
    }
    await prisma.site.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err: any) {
    if (err?.code === 'P2003') {
      return res.status(409).json({ error: 'Site has layouts — delete them first' });
    }
    res.status(500).json({ error: String(err) });
  }
});

export default router;
