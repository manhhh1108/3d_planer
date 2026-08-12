import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// GET / — list all projects with layout and product counts, ordered by updatedAt desc
router.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — single project with layouts and products
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { products: true },
    });
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST / — create project
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const project = await prisma.project.create({
      data: { name, description },
    });
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /:id — update project
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { name, description },
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id — delete project
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
