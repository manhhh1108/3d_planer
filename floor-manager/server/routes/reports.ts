import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// GET /summary?layoutId=xxx&date=YYYY-MM-DD
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { layoutId, date } = req.query as { layoutId?: string; date?: string };
    if (!layoutId || !date) {
      return res.status(400).json({ error: 'layoutId and date are required' });
    }

    const snapshot = await prisma.snapshot.findUnique({
      where: { layoutId_date: { layoutId, date: new Date(date) } },
      include: {
        positions: { include: { product: true } },
        layout: true,
      },
    });

    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });

    const totalArea = snapshot.positions.reduce((sum, p) => sum + (p.product.areaM2 ?? 0), 0);
    const totalWeight = snapshot.positions.reduce((sum, p) => sum + (p.product.weightKg ?? 0), 0);
    const layoutArea = snapshot.layout.widthM * snapshot.layout.heightM;
    const usageRate = layoutArea > 0 ? Math.round((totalArea / layoutArea) * 1000) / 10 : 0;

    res.json({
      snapshot,
      totalArea,
      totalWeight,
      layoutArea,
      usageRate,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /by-process?layoutId=xxx&date=YYYY-MM-DD
router.get('/by-process', async (req: Request, res: Response) => {
  try {
    const { layoutId, date } = req.query as { layoutId?: string; date?: string };
    if (!layoutId || !date) {
      return res.status(400).json({ error: 'layoutId and date are required' });
    }

    const snapshot = await prisma.snapshot.findUnique({
      where: { layoutId_date: { layoutId, date: new Date(date) } },
      include: {
        positions: { include: { product: true } },
      },
    });

    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });

    const byProcess: Record<string, { count: number; totalArea: number; totalWeight: number }> = {};
    for (const pos of snapshot.positions) {
      const stage = pos.product.processStage ?? 'Khac';
      if (!byProcess[stage]) byProcess[stage] = { count: 0, totalArea: 0, totalWeight: 0 };
      byProcess[stage].count++;
      byProcess[stage].totalArea += pos.product.areaM2 ?? 0;
      byProcess[stage].totalWeight += pos.product.weightKg ?? 0;
    }

    const grandTotalArea = Object.values(byProcess).reduce((s, v) => s + v.totalArea, 0);
    const result = Object.entries(byProcess).map(([stage, data]) => ({
      processStage: stage,
      ...data,
      areaPercent: grandTotalArea > 0 ? Math.round((data.totalArea / grandTotalArea) * 1000) / 10 : 0,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /occupation?projectId=xxx&layoutId=xxx — both optional
// projectId now filters by the PRODUCT's project (layouts are cross-project)
router.get('/occupation', async (req: Request, res: Response) => {
  try {
    const { projectId, layoutId } = req.query as { projectId?: string; layoutId?: string };

    let layoutIds: string[];
    if (layoutId) {
      layoutIds = [layoutId];
    } else {
      const layouts = await prisma.layout.findMany({ select: { id: true } });
      layoutIds = layouts.map((l) => l.id);
    }
    if (layoutIds.length === 0) return res.json([]);

    const snapshots = await prisma.snapshot.findMany({
      where: { layoutId: { in: layoutIds } },
      orderBy: { date: 'asc' },
      include: {
        positions: {
          include: { product: { include: { project: { select: { name: true } } } } },
        },
        layout: true,
      },
    });

    type OccupationPeriod = {
      productName: string;
      productCode: string;
      projectName: string;
      layoutName: string;
      startDate: string;
      endDate: string;
      days: number;
      areaM2: number;
      areaDays: number;
    };

    type ActiveInfo = {
      startDate: Date;
      productName: string;
      productCode: string;
      projectName: string;
      areaM2: number;
    };

    const periods: OccupationPeriod[] = [];

    const snapshotsByLayout = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const arr = snapshotsByLayout.get(s.layoutId) ?? [];
      arr.push(s);
      snapshotsByLayout.set(s.layoutId, arr);
    }

    for (const [, layoutSnapshots] of snapshotsByLayout) {
      if (layoutSnapshots.length === 0) continue;
      const layoutName = layoutSnapshots[0].layout.name;

      const active = new Map<string, ActiveInfo>();

      const pushPeriod = (info: ActiveInfo, endDate: Date) => {
        const days = Math.max(1, Math.round((endDate.getTime() - info.startDate.getTime()) / 86400000));
        periods.push({
          layoutName,
          productName: info.productName,
          productCode: info.productCode,
          projectName: info.projectName,
          areaM2: info.areaM2,
          startDate: info.startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
          days,
          areaDays: Math.round(info.areaM2 * days * 10) / 10,
        });
      };

      for (let i = 0; i < layoutSnapshots.length; i++) {
        const snap = layoutSnapshots[i];
        const snapDate = new Date(snap.date);
        // filter theo dự án của product (nếu có query projectId)
        const relevant = snap.positions.filter(
          (p) => !projectId || p.product.projectId === projectId
        );
        const presentProductIds = new Set(relevant.map((p) => p.productId));

        for (const [pid, info] of active) {
          if (!presentProductIds.has(pid)) {
            const prevSnap = layoutSnapshots[i - 1];
            pushPeriod(info, prevSnap ? new Date(prevSnap.date) : snapDate);
            active.delete(pid);
          }
        }

        for (const pos of relevant) {
          if (!active.has(pos.productId)) {
            active.set(pos.productId, {
              startDate: snapDate,
              productName: pos.product.name,
              productCode: pos.product.code,
              projectName: pos.product.project.name,
              areaM2: pos.product.areaM2 ?? 0,
            });
          }
        }
      }

      const lastDate = new Date(layoutSnapshots[layoutSnapshots.length - 1].date);
      for (const [, info] of active) {
        pushPeriod(info, lastDate);
      }
    }

    res.json(periods);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /by-process-range?layoutId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/by-process-range', async (req: Request, res: Response) => {
  try {
    const { layoutId, startDate, endDate } = req.query as {
      layoutId?: string;
      startDate?: string;
      endDate?: string;
    };
    if (!layoutId || !startDate || !endDate) {
      return res.status(400).json({ error: 'layoutId, startDate và endDate là bắt buộc' });
    }

    const snapshots = await prisma.snapshot.findMany({
      where: {
        layoutId: String(layoutId),
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { date: 'asc' },
      include: { positions: { include: { product: true } } },
    });

    const result = snapshots.map((snap) => {
      const stageArea: Record<string, number> = {};
      for (const pos of snap.positions) {
        const stage = pos.product.processStage ?? 'Khác';
        stageArea[stage] =
          Math.round(((stageArea[stage] ?? 0) + (pos.product.areaM2 ?? 0)) * 10) / 10;
      }
      return {
        date: snap.date.toISOString().slice(0, 10),
        stages: stageArea,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
