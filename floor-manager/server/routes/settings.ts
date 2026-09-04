import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const OUTSIDE_ZONE_VALUES = ['block', 'warn', 'silent'] as const;
const DEFAULTS: Record<string, unknown> = { outsideZonePolicy: 'warn', defaultMarginCm: 50 };

// GET /:key — mọi người đăng nhập đọc được; trả mặc định nếu chưa set
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);
    const row = await prisma.appSetting.findUnique({ where: { key } });
    res.json({ key, value: row ? row.value : (DEFAULTS[key] ?? null) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /:key — chỉ ADMIN
router.put('/:key', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);
    const { value } = req.body as { value?: unknown };
    if (key === 'outsideZonePolicy' && !OUTSIDE_ZONE_VALUES.includes(value as any)) {
      return res.status(400).json({ error: 'value phải là block | warn | silent' });
    }
    if (key === 'defaultMarginCm') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'defaultMarginCm phải là số ≥ 0' });
      }
    }
    const row = await prisma.appSetting.upsert({
      where: { key },
      update: { value: value as any },
      create: { key, value: value as any },
    });
    res.json({ key: row.key, value: row.value });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
