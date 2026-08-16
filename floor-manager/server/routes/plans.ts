import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Helper: check plan version for optimistic locking
async function checkPlanVersion(
  planId: string,
  clientVersion: number | undefined
): Promise<{ plan: Awaited<ReturnType<typeof prisma.plan.findUnique>>; conflict: boolean }> {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return { plan: null, conflict: false };
  if (clientVersion !== undefined && plan.version !== clientVersion) {
    return { plan, conflict: true };
  }
  return { plan, conflict: false };
}

// Write operations require ADMIN or PLANNING role
router.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireRole('ADMIN', 'PLANNING')(req, _res, next);
});

// ── /plans/items/:id routes MUST come before /:id to avoid Express treating "items" as :id ──

// PUT /plans/items/:id (update a plan item)
router.put('/items/:id', async (req: Request, res: Response) => {
  try {
    const { x, y, rotation, startDate, endDate, planVersion } = req.body;
    const data: Record<string, unknown> = {};
    if (x != null) data.x = Number(x);
    if (y != null) data.y = Number(y);
    if (rotation != null) data.rotation = Number(rotation);
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);
    if (data.startDate && data.endDate && (data.startDate as Date) >= (data.endDate as Date)) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    // Find item to get planId for version check
    if (planVersion !== undefined) {
      const existingItem = await prisma.planItem.findUnique({ where: { id: String(req.params.id) } });
      if (!existingItem) return res.status(404).json({ error: 'Plan item not found' });
      const { plan, conflict } = await checkPlanVersion(existingItem.planId, planVersion);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      if (conflict) {
        return res.status(409).json({
          error: 'Dữ liệu đã được cập nhật bởi người khác. Vui lòng tải lại.',
          currentVersion: plan.version,
        });
      }
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

    // Increment plan version after successful item update
    await prisma.plan.update({ where: { id: item.planId }, data: { version: { increment: 1 } } });

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /plans/items/:id
router.delete('/items/:id', async (req: Request, res: Response) => {
  try {
    const planVersion = req.body?.planVersion;

    if (planVersion !== undefined) {
      const existingItem = await prisma.planItem.findUnique({ where: { id: String(req.params.id) } });
      if (!existingItem) return res.status(404).json({ error: 'Plan item not found' });
      const { plan, conflict } = await checkPlanVersion(existingItem.planId, planVersion);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      if (conflict) {
        return res.status(409).json({
          error: 'Dữ liệu đã được cập nhật bởi người khác. Vui lòng tải lại.',
          currentVersion: plan.version,
        });
      }
    }

    // Find planId before deleting for version increment
    const itemToDelete = await prisma.planItem.findUnique({ where: { id: String(req.params.id) } });
    if (!itemToDelete) return res.status(404).json({ error: 'Plan item not found' });

    await prisma.planItem.delete({ where: { id: String(req.params.id) } });

    // Increment plan version after successful delete
    await prisma.plan.update({ where: { id: itemToDelete.planId }, data: { version: { increment: 1 } } });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── /plans base routes ──

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
    const { name, active, version } = req.body;

    if (version !== undefined) {
      const current = await prisma.plan.findUnique({ where: { id: String(req.params.id) } });
      if (!current) return res.status(404).json({ error: 'Plan not found' });
      if (current.version !== version) {
        return res.status(409).json({
          error: 'Dữ liệu đã được cập nhật bởi người khác. Vui lòng tải lại.',
          currentVersion: current.version,
        });
      }
    }

    const plan = await prisma.plan.update({
      where: { id: String(req.params.id) },
      data: {
        ...(name !== undefined && { name }),
        ...(active !== undefined && { active }),
        version: { increment: 1 },
      },
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

// ── /plans/:id/items, /plans/:id/conflicts, /plans/:id/compare ──

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
    const { productId, x, y, rotation, startDate, endDate, planVersion } = req.body;
    if (!productId || x == null || y == null || !startDate || !endDate) {
      return res.status(400).json({ error: 'productId, x, y, startDate, endDate are required' });
    }
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    const planId = String(req.params.id);
    const { plan, conflict } = await checkPlanVersion(planId, planVersion);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    if (conflict) {
      return res.status(409).json({
        error: 'Dữ liệu đã được cập nhật bởi người khác. Vui lòng tải lại.',
        currentVersion: plan.version,
      });
    }

    const item = await prisma.planItem.create({
      data: {
        planId,
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

    // Increment plan version after successful item creation
    await prisma.plan.update({ where: { id: planId }, data: { version: { increment: 1 } } });

    res.status(201).json(item);
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

        const aStart = new Date(a.startDate).getTime();
        const aEnd = new Date(a.endDate).getTime();
        const bStart = new Date(b.startDate).getTime();
        const bEnd = new Date(b.endDate).getTime();
        if (aStart >= bEnd || bStart >= aEnd) continue;

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

// GET /plans/:id/compare?snapshotId=xxx
router.get('/:id/compare', async (req: Request, res: Response) => {
  try {
    const plan = await prisma.plan.findUnique({ where: { id: String(req.params.id) } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const snapshotId = req.query.snapshotId as string | undefined;
    const snapshot = snapshotId
      ? await prisma.snapshot.findUnique({
          where: { id: snapshotId },
          include: { positions: { include: { product: { select: { id: true, name: true, code: true } } } } },
        })
      : await prisma.snapshot.findFirst({
          where: { layoutId: plan.layoutId },
          orderBy: { date: 'desc' },
          include: { positions: { include: { product: { select: { id: true, name: true, code: true } } } } },
        });

    if (!snapshot) {
      return res.json({
        planId: plan.id,
        snapshotId: null,
        snapshotDate: null,
        items: [],
        summary: { matched: 0, misplaced: 0, missing: 0, unplanned: 0 },
      });
    }

    const snapshotDate = new Date(snapshot.date);

    const planItems = await prisma.planItem.findMany({
      where: {
        planId: plan.id,
        startDate: { lte: snapshotDate },
        endDate: { gt: snapshotDate },
      },
      include: { product: { select: { id: true, name: true, code: true } } },
    });

    const positions = snapshot.positions;

    type CompareItem = {
      productId: string;
      productName: string;
      productCode: string;
      status: 'matched' | 'misplaced' | 'missing' | 'unplanned';
      planned: { x: number; y: number } | null;
      actual: { x: number; y: number } | null;
      distanceM: number | null;
    };

    const MATCH_THRESHOLD = 2;
    const result: CompareItem[] = [];
    const matchedPositionIds = new Set<string>();

    for (const pi of planItems) {
      const pos = positions.find((p) => p.productId === pi.productId);
      if (pos) {
        matchedPositionIds.add(pos.id);
        const dx = pi.x - pos.x;
        const dy = pi.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const distRounded = Math.round(dist * 100) / 100;
        result.push({
          productId: pi.productId,
          productName: pi.product.name,
          productCode: pi.product.code,
          status: dist < MATCH_THRESHOLD ? 'matched' : 'misplaced',
          planned: { x: pi.x, y: pi.y },
          actual: { x: pos.x, y: pos.y },
          distanceM: distRounded,
        });
      } else {
        result.push({
          productId: pi.productId,
          productName: pi.product.name,
          productCode: pi.product.code,
          status: 'missing',
          planned: { x: pi.x, y: pi.y },
          actual: null,
          distanceM: null,
        });
      }
    }

    for (const pos of positions) {
      if (!matchedPositionIds.has(pos.id)) {
        result.push({
          productId: pos.productId,
          productName: pos.product.name,
          productCode: pos.product.code,
          status: 'unplanned',
          planned: null,
          actual: { x: pos.x, y: pos.y },
          distanceM: null,
        });
      }
    }

    const summary = {
      matched: result.filter((r) => r.status === 'matched').length,
      misplaced: result.filter((r) => r.status === 'misplaced').length,
      missing: result.filter((r) => r.status === 'missing').length,
      unplanned: result.filter((r) => r.status === 'unplanned').length,
    };

    res.json({
      planId: plan.id,
      snapshotId: snapshot.id,
      snapshotDate: snapshot.date.toISOString().slice(0, 10),
      items: result,
      summary,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
