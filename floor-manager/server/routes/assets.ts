import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../db.js';
import { assetPaths } from '../cad/paths.js';
import { ConvertQueue, type ConverterFn } from '../cad/queue.js';
import { runConversion } from '../cad/convert.js';

const ALLOWED = ['dwg', 'dxf', 'step', 'stp', 'ifc'];
const TMP_DIR = path.resolve(process.env.STORAGE_DIR || './storage', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 200 * 1024 * 1024 },
});

export const convertQueue = new ConvertQueue(runConversion, 2);

function serialize(asset: {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  error: string | null;
  unitScale: number;
  bboxLengthM: number | null;
  bboxWidthM: number | null;
  bboxHeightM: number | null;
  areaM2: number | null;
  createdAt: Date;
}) {
  const p = assetPaths(asset.id);
  const ready = asset.status === 'ready';
  return {
    ...asset,
    footprintUrl: ready ? p.footprintUrl : null,
    meshUrl: ready && fs.existsSync(p.meshFile) ? p.meshUrl : null,
    thumbUrl: ready ? p.thumbUrl : null,
  };
}

const router = Router();

// POST / — multipart: file (bắt buộc), productId?, unitScale?
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    if (!ALLOWED.includes(ext)) {
      fs.rmSync(req.file.path, { force: true });
      return res.status(400).json({ error: `File type .${ext} not supported (${ALLOWED.join(', ')})` });
    }
    const { productId } = req.body;
    const unitScale = req.body.unitScale
      ? Number(req.body.unitScale)
      : ext === 'ifc'
        ? 1
        : 0.001;

    const asset = await prisma.asset.create({
      data: { fileName: req.file.originalname, fileType: ext, unitScale },
    });
    const p = assetPaths(asset.id, ext);
    fs.mkdirSync(p.sourceDir, { recursive: true });
    fs.renameSync(req.file.path, p.sourceFile!);

    if (productId) {
      await prisma.product.update({ where: { id: String(productId) }, data: { assetId: asset.id } });
    }
    convertQueue.enqueue(asset.id);
    res.status(201).json(serialize(asset));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — trạng thái + url artifact
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const asset = await prisma.asset.findUnique({ where: { id: String(req.params.id) } });
    if (!asset) return res.status(404).json({ error: 'Not found' });
    res.json(serialize(asset));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id — gỡ khỏi products (SetNull), xóa row + file
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) return res.status(404).json({ error: 'Not found' });
    await prisma.asset.delete({ where: { id } }); // products.asset_id SET NULL bởi FK
    const p = assetPaths(id);
    fs.rmSync(p.sourceDir, { recursive: true, force: true });
    fs.rmSync(p.artifactDir, { recursive: true, force: true });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
