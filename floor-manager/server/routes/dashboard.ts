import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const dateParam = req.query.date as string | undefined;

    // --- counts (always from full DB) ---
    const [sitesCount, projectsCount] = await Promise.all([
      prisma.site.count(),
      prisma.project.count(),
    ]);

    // --- validate date param ---
    if (dateParam !== undefined) {
      const parsedDate = new Date(dateParam);
      if (isNaN(parsedDate.getTime())) {
        res.status(400).json({ error: 'Invalid date parameter' });
        return;
      }
    }

    // --- find relevant snapshot per layout ---
    const layouts = await prisma.layout.findMany({
      include: { site: { select: { name: true } } },
    });

    type SnapshotWithPositions = {
      id: string;
      layoutId: string;
      date: Date;
      createdAt: Date;
      createdBy: string | null;
      positions: {
        productId: string;
        product: {
          areaM2: number | null;
          weightKg: number | null;
          processStage: string | null;
        };
      }[];
    };

    const layoutIds = layouts.map((l) => l.id);
    const positionInclude = {
      positions: {
        include: { product: { select: { areaM2: true, weightKg: true, processStage: true } } },
      },
    } as const;

    let snapshotsByLayout: SnapshotWithPositions[];

    if (dateParam) {
      // Fetch all snapshots for the given date in one query
      snapshotsByLayout = await prisma.snapshot.findMany({
        where: { layoutId: { in: layoutIds }, date: new Date(dateParam) },
        include: positionInclude,
      });
    } else {
      // Fetch all snapshots with positions, then keep only the latest per layout
      const allSnapshots = await prisma.snapshot.findMany({
        where: { layoutId: { in: layoutIds } },
        orderBy: { date: 'desc' },
        include: positionInclude,
      });
      const seenLayoutIds = new Set<string>();
      snapshotsByLayout = [];
      for (const snap of allSnapshots) {
        if (!seenLayoutIds.has(snap.layoutId)) {
          seenLayoutIds.add(snap.layoutId);
          snapshotsByLayout.push(snap);
        }
      }
    }

    // --- aggregate metrics from selected snapshots ---
    const productIds = new Set<string>();
    let totalWeightKg = 0;
    let totalAreaM2 = 0;
    const stageMap = new Map<string, { count: number; totalAreaM2: number; totalWeightKg: number }>();

    for (const snap of snapshotsByLayout) {
      for (const pos of snap.positions) {
        productIds.add(pos.productId);
        const area = pos.product.areaM2 ?? 0;
        const weight = pos.product.weightKg ?? 0;
        totalAreaM2 += area;
        totalWeightKg += weight;

        const stage = pos.product.processStage ?? 'Khac';
        const entry = stageMap.get(stage) ?? { count: 0, totalAreaM2: 0, totalWeightKg: 0 };
        entry.count++;
        entry.totalAreaM2 += area;
        entry.totalWeightKg += weight;
        stageMap.set(stage, entry);
      }
    }

    // --- layout usage ---
    const layoutUsage = layouts.map((layout) => {
      const snap = snapshotsByLayout.find((s) => s.layoutId === layout.id);
      const usedAreaM2 = snap
        ? snap.positions.reduce((sum, p) => sum + (p.product.areaM2 ?? 0), 0)
        : 0;
      const layoutAreaM2 = layout.widthM * layout.heightM;
      return {
        layoutId: layout.id,
        layoutName: layout.name,
        siteName: layout.site.name,
        usedAreaM2: Math.round(usedAreaM2 * 100) / 100,
        totalAreaM2: Math.round(layoutAreaM2 * 100) / 100,
        usagePercent: layoutAreaM2 > 0 ? Math.round((usedAreaM2 / layoutAreaM2) * 1000) / 10 : 0,
        productCount: snap ? snap.positions.length : 0,
      };
    });

    // --- by process stage ---
    const byProcessStage = [...stageMap.entries()].map(([stage, data]) => ({
      stage,
      count: data.count,
      totalAreaM2: Math.round(data.totalAreaM2 * 100) / 100,
      totalWeightKg: Math.round(data.totalWeightKg * 100) / 100,
    }));

    // --- recent activity ---
    const [recentSnapshots, recentProducts] = await Promise.all([
      prisma.snapshot.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { layout: { select: { name: true } } },
      }),
      prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { project: { select: { name: true } } },
      }),
    ]);

    const recentActivity = [
      ...recentSnapshots.map((s) => ({
        type: 'snapshot' as const,
        description: `${s.layout.name} — snapshot ${new Date(s.date).toISOString().slice(0, 10)}`,
        layoutId: s.layoutId,
        createdBy: s.createdBy,
        createdAt: s.createdAt.toISOString(),
      })),
      ...recentProducts.map((p) => ({
        type: 'product' as const,
        description: `${p.code} ${p.name} — ${p.project.name}`,
        projectId: p.projectId,
        createdBy: null,
        createdAt: p.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 15);

    res.json({
      counts: {
        sites: sitesCount,
        projects: projectsCount,
        productsOnLayout: productIds.size,
        totalWeightKg: Math.round(totalWeightKg * 100) / 100,
        totalAreaM2: Math.round(totalAreaM2 * 100) / 100,
      },
      layoutUsage,
      byProcessStage,
      recentActivity,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
