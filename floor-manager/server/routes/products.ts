import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// GET /?projectId=xxx — list products filtered by projectId
router.get('/', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const products = await prisma.product.findMany({
      where: projectId ? { projectId: String(projectId) } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — single product
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST / — create product
router.post('/', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.create({ data: req.body });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /:id — update product
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id — delete product
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.product.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
