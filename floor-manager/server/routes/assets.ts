import { Router, Request, Response } from 'express';
import fs from 'fs';
import prisma from '../db.js';
import { assetPaths } from '../cad/paths.js';
import { requireRole } from '../middleware/auth.js';
import { convertQueue } from '../cad/convertQueue.js';
import { ALLOWED_CAD_EXT, cadUpload, cadExtOf, storeUploadedAsset } from '../cad/storeAsset.js';

// Re-export: tests và code cũ vẫn import convertQueue từ đây.
export { convertQueue };

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

router.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireRole('ADMIN', 'PLANNING')(req, _res, next);
});

// POST / — multipart: file (bắt buộc), productId?, unitScale?
router.post('/', cadUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const ext = cadExtOf(req.file.originalname);
    if (!ALLOWED_CAD_EXT.includes(ext)) {
      fs.rmSync(req.file.path, { force: true });
      return res
        .status(400)
        .json({ error: `File type .${ext} not supported (${ALLOWED_CAD_EXT.join(', ')})` });
    }
    const asset = await storeUploadedAsset(req.file, ext, {
      unitScale: req.body.unitScale ? Number(req.body.unitScale) : undefined,
      productId: req.body.productId ? String(req.body.productId) : undefined,
    });
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
