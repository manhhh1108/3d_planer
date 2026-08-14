import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { layoutBgPaths } from '../cad/paths.js';
import { dxfToSvg } from '../cad/convertDxfSvg.js';
import { dwgToDxfText } from '../cad/convertDwg.js';

const router = Router();

const TMP_DIR = path.resolve(process.env.STORAGE_DIR || './storage', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({ dest: TMP_DIR, limits: { fileSize: 50 * 1024 * 1024 } });

router.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireRole('ADMIN', 'PLANNING')(req, _res, next);
});

// GET /?siteId=xxx — list layouts with snapshot count
router.get('/', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.query;
    const layouts = await prisma.layout.findMany({
      where: siteId ? { siteId: String(siteId) } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { snapshots: true } },
      },
    });
    res.json(layouts);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — single layout with last 10 snapshots ordered by date desc
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const layout = await prisma.layout.findUnique({
      where: { id: String(req.params.id) },
      include: {
        snapshots: {
          orderBy: { date: 'desc' },
          take: 10,
        },
      },
    });
    if (!layout) return res.status(404).json({ error: 'Not found' });
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST / — create layout
router.post('/', async (req: Request, res: Response) => {
  try {
    const layout = await prisma.layout.create({ data: req.body });
    res.status(201).json(layout);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /:id — update layout
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const layout = await prisma.layout.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id — delete layout
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.layout.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /:id/background — upload DXF/DWG as layout floor plan background
router.post('/:id/background', upload.single('file'), async (req: Request, res: Response) => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    if (!['dxf', 'dwg'].includes(ext)) {
      return res.status(400).json({ error: 'Only DXF and DWG files are supported' });
    }
    const layout = await prisma.layout.findUnique({ where: { id: String(req.params.id) } });
    if (!layout) return res.status(404).json({ error: 'Layout not found' });

    if (ext === 'dwg') {
      if (!process.env.ODA_CONVERTER_PATH) {
        return res.status(422).json({ error: 'DWG conversion requires ODA_CONVERTER_PATH to be set on the server' });
      }
    }

    const dxfText = ext === 'dwg'
      ? await dwgToDxfText(req.file.path)
      : fs.readFileSync(req.file.path, 'utf8');

    const { svg, widthM, heightM } = dxfToSvg(dxfText);

    const p = layoutBgPaths(String(req.params.id));
    if (layout.backgroundFile) {
      fs.rmSync(p.artifactDir, { recursive: true, force: true });
    }
    fs.mkdirSync(p.sourceDir, { recursive: true });
    fs.mkdirSync(p.artifactDir, { recursive: true });
    fs.copyFileSync(req.file.path, p.sourceFile(ext));
    fs.writeFileSync(p.bgFile, svg, 'utf8');

    const updated = await prisma.layout.update({
      where: { id: String(req.params.id) },
      data: { backgroundFile: p.bgUrl, widthM, heightM },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    if (tmpPath) fs.rmSync(tmpPath, { force: true });
  }
});

// DELETE /:id/background — remove layout floor plan background, preserve dimensions
router.delete('/:id/background', async (req: Request, res: Response) => {
  try {
    const layout = await prisma.layout.findUnique({ where: { id: String(req.params.id) } });
    if (!layout) return res.status(404).json({ error: 'Layout not found' });

    const p = layoutBgPaths(String(req.params.id));
    fs.rmSync(p.artifactDir, { recursive: true, force: true });

    const updated = await prisma.layout.update({
      where: { id: String(req.params.id) },
      data: { backgroundFile: null },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
