import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';

const router = Router();
// All routes here require ADMIN (enforced at app.ts mount point)

function getSingleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// GET /api/users
router.get('/', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/users
router.post('/', async (req: Request, res: Response) => {
  try {
    const { email, name, role, password } = req.body as {
      email?: string; name?: string; role?: string; password?: string;
    };
    if (!email || !name || !role || !password) {
      return res.status(400).json({ error: 'email, name, role, password are required' });
    }
    if (!['ADMIN', 'PLANNING', 'VIEWER'].includes(role)) {
      return res.status(400).json({ error: 'role must be ADMIN, PLANNING, or VIEWER' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, name, role: role as 'ADMIN' | 'PLANNING' | 'VIEWER', passwordHash },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/users/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = getSingleParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });

    const { name, role, active } = req.body as { name?: string; role?: string; active?: boolean };
    if (role && !['ADMIN', 'PLANNING', 'VIEWER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role: role as 'ADMIN' | 'PLANNING' | 'VIEWER' }),
        ...(active !== undefined && { active }),
      },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
    res.json(user);
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const id = getSingleParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });

    const { password } = req.body as { password?: string };
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: String(err) });
  }
});

export default router;
