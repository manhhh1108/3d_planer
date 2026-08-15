import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Write operations require ADMIN or PLANNING role
router.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireRole('ADMIN', 'PLANNING')(req, _res, next);
});

// GET /plans?layoutId=xxx
router.get('/', async (req: Request, res: Response) => {
  try {
    const { layoutId } = req.query;
    if (!layoutId) return res.status(400).json({ error: 'layoutId is required' });
    const plans = await prisma.plan.findMany({
      where: { layoutId: String(layoutId) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /plans
router.post('/', async (req: Request, res: Response) => {
  try {
    const { layoutId, name } = req.body;
    if (!layoutId || !name) return res.status(400).json({ error: 'layoutId and name are required' });
    const plan = await prisma.plan.create({ data: { layoutId, name } });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /plans/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, active } = req.body;
    const plan = await prisma.plan.update({
      where: { id: String(req.params.id) },
      data: { ...(name !== undefined && { name }), ...(active !== undefined && { active }) },
    });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /plans/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.plan.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /plans/:id/items
router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const items = await prisma.planItem.findMany({
      where: { planId: String(req.params.id) },
      orderBy: { startDate: 'asc' },
      include: {
        product: {
          select: { id: true, name: true, code: true, processStage: true, color: true, areaM2: true, weightKg: true, metadata: true },
        },
      },
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /plans/:id/items
router.post('/:id/items', async (req: Request, res: Response) => {
  try {
    const { productId, x, y, rotation, startDate, endDate } = req.body;
    if (!productId || x == null || y == null || !startDate || !endDate) {
      return res.status(400).json({ error: 'productId, x, y, startDate, endDate are required' });
    }
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }
    const item = await prisma.planItem.create({
      data: {
        planId: String(req.params.id),
        productId,
        x: Number(x),
        y: Number(y),
        rotation: Number(rotation ?? 0),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      include: {
        product: {
          select: { id: true, name: true, code: true, processStage: true, color: true, areaM2: true, weightKg: true, metadata: true },
        },
      },
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /plans/items/:id (update a plan item)
router.put('/items/:id', async (req: Request, res: Response) => {
  try {
    const { x, y, rotation, startDate, endDate } = req.body;
    const data: Record<string, unknown> = {};
    if (x != null) data.x = Number(x);
    if (y != null) data.y = Number(y);
    if (rotation != null) data.rotation = Number(rotation);
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);
    if (data.startDate && data.endDate && (data.startDate as Date) >= (data.endDate as Date)) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }
    const item = await prisma.planItem.update({
      where: { id: String(req.params.id) },
      data,
      include: {
        product: {
          select: { id: true, name: true, code: true, processStage: true, color: true, areaM2: true, weightKg: true, metadata: true },
        },
      },
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /plans/items/:id
router.delete('/items/:id', async (req: Request, res: Response) => {
  try {
    await prisma.planItem.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /plans/:id/conflicts
router.get('/:id/conflicts', async (req: Request, res: Response) => {
  try {
    const items = await prisma.planItem.findMany({
      where: { planId: String(req.params.id) },
      include: {
        product: {
          select: { id: true, name: true, code: true, metadata: true },
        },
      },
    });

    type ConflictItem = { id: string; productName: string; startDate: string; endDate: string };
    type Conflict = { itemA: ConflictItem; itemB: ConflictItem; overlapStart: string; overlapEnd: string };
    type Suggestion = { itemId: string; suggestedStart: string; reason: string };

    const conflicts: Conflict[] = [];
    const conflictedIds = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];

        // Check time overlap
        const aStart = new Date(a.startDate).getTime();
        const aEnd = new Date(a.endDate).getTime();
        const bStart = new Date(b.startDate).getTime();
        const bEnd = new Date(b.endDate).getTime();
        if (aStart >= bEnd || bStart >= aEnd) continue;

        // Check bounding box overlap
        const aMeta = a.product.metadata as { widthM?: number; depthM?: number } | null;
        const bMeta = b.product.metadata as { widthM?: number; depthM?: number } | null;
        const aW = (aMeta?.widthM ?? 1) / 2;
        const aD = (aMeta?.depthM ?? 1) / 2;
        const bW = (bMeta?.widthM ?? 1) / 2;
        const bD = (bMeta?.depthM ?? 1) / 2;

        const xOverlap = Math.abs(a.x - b.x) < (aW + bW);
        const yOverlap = Math.abs(a.y - b.y) < (aD + bD);
        if (!xOverlap || !yOverlap) continue;

        const overlapStart = new Date(Math.max(aStart, bStart));
        const overlapEnd = new Date(Math.min(aEnd, bEnd));

        conflicts.push({
          itemA: { id: a.id, productName: a.product.name, startDate: a.startDate.toISOString().slice(0, 10), endDate: a.endDate.toISOString().slice(0, 10) },
          itemB: { id: b.id, productName: b.product.name, startDate: b.startDate.toISOString().slice(0, 10), endDate: b.endDate.toISOString().slice(0, 10) },
          overlapStart: overlapStart.toISOString().slice(0, 10),
          overlapEnd: overlapEnd.toISOString().slice(0, 10),
        });
        conflictedIds.add(a.id);
        conflictedIds.add(b.id);
      }
    }

    // Suggestions: for each conflicted item, find earliest start after all overlapping items at same position
    const suggestions: Suggestion[] = [];
    for (const id of conflictedIds) {
      const item = items.find((i) => i.id === id)!;
      const overlapping = items.filter((other) => {
        if (other.id === id) return false;
        const oMeta = other.product.metadata as { widthM?: number; depthM?: number } | null;
        const iMeta = item.product.metadata as { widthM?: number; depthM?: number } | null;
        const iW = (iMeta?.widthM ?? 1) / 2;
        const iD = (iMeta?.depthM ?? 1) / 2;
        const oW = (oMeta?.widthM ?? 1) / 2;
        const oD = (oMeta?.depthM ?? 1) / 2;
        return Math.abs(item.x - other.x) < (iW + oW) && Math.abs(item.y - other.y) < (iD + oD);
      });
      if (overlapping.length === 0) continue;

      const latestEnd = overlapping.reduce(
        (max, o) => Math.max(max, new Date(o.endDate).getTime()),
        0
      );
      const suggestedStart = new Date(latestEnd);
      suggestedStart.setDate(suggestedStart.getDate() + 1);

      suggestions.push({
        itemId: id,
        suggestedStart: suggestedStart.toISOString().slice(0, 10),
        reason: `Thoi gian som nhat khong xung dot tai vi tri (${item.x}, ${item.y})`,
      });
    }

    res.json({ conflicts, suggestions });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
