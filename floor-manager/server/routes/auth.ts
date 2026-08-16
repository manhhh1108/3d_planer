import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const SECURE = process.env.NODE_ENV === 'production';

function issueTokens(payload: { id: string; email: string; role: string }) {
  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: payload.id }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

function setCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie('access_token', accessToken, {
    httpOnly: true, sameSite: 'strict', secure: SECURE,
    maxAge: 15 * 60 * 1000, path: '/',
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true, sameSite: 'strict', secure: SECURE,
    maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh',
  });
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.active) return res.status(403).json({ error: 'Account disabled' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const { accessToken, refreshToken } = issueTokens({ id: user.id, email: user.email, role: user.role });
    setCookies(res, accessToken, refreshToken);
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, name, password } = req.body as { email?: string; name?: string; password?: string };
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'email, name, password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email đã tồn tại' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, name, role: 'PENDING', passwordHash },
    });

    // Auto-login after register
    const { accessToken, refreshToken } = issueTokens({ id: user.id, email: user.email, role: user.role });
    setCookies(res, accessToken, refreshToken);
    res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.['refresh_token'] as string | undefined;
    if (!token) return res.status(401).json({ error: 'No refresh token' });

    let payload: { id: string };
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as { id: string };
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.active) return res.status(401).json({ error: 'User not found or disabled' });

    const { accessToken, refreshToken } = issueTokens({ id: user.id, email: user.email, role: user.role });
    setCookies(res, accessToken, refreshToken);
    // Return accessToken in body so SvelteKit hooks.server.ts can forward it as a cookie
    res.json({
      ok: true,
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('access_token', { httpOnly: true, sameSite: 'strict', secure: SECURE, path: '/' });
  res.clearCookie('refresh_token', { httpOnly: true, sameSite: 'strict', secure: SECURE, path: '/api/auth/refresh' });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
