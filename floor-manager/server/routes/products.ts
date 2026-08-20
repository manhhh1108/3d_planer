import { Router, Request, Response } from 'express';
import fs from 'fs';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { assetPaths } from '../cad/paths.js';

const router = Router();

/**
 * footprintUrl/meshUrl/thumbUrl là URL tính toán từ assetId (không lưu trong DB).
 * Route products include asset thô -> phải bổ sung các URL này để frontend
 * (productCatalog.loadProductCatalog) nạp được footprint, nếu không block sẽ vẽ hộp.
 */
function withAssetUrls(product: { asset?: { id: string; status: string } | null } & Record<string, unknown>) {
  const asset = product.asset;
  if (!asset) return product;
  const p = assetPaths(asset.id);
  const ready = asset.status === 'ready';
  return {
    ...product,
    asset: {
      ...asset,
      footprintUrl: ready ? p.footprintUrl : null,
      meshUrl: ready && fs.existsSync(p.meshFile) ? p.meshUrl : null,
      thumbUrl: ready ? p.thumbUrl : null,
    },
  };
}

router.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireRole('ADMIN', 'PLANNING')(req, _res, next);
});

// GET /?projectId=xxx — list products filtered by projectId
router.get('/', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const products = await prisma.product.findMany({
      where: projectId ? { projectId: String(projectId) } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { asset: true },
    });
    res.json(products.map(withAssetUrls));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — single product
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: String(req.params.id) },
      include: { asset: true },
    });
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json(withAssetUrls(product));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST / — create product
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      projectId, name, code, weightKg, areaM2, processStage,
      category, color, file2dUrl, file3dUrl, sharepointLink, metadata, quantity, assetId
    } = req.body as {
      projectId: string; name: string; code: string;
      weightKg?: number; areaM2?: number; processStage?: string;
      category?: string; color?: string; file2dUrl?: string; file3dUrl?: string;
      sharepointLink?: string; metadata?: object; quantity?: number; assetId?: string;
    };
    const product = await prisma.product.create({
      data: {
        projectId, name, code,
        ...(weightKg !== undefined ? { weightKg } : {}),
        ...(areaM2 !== undefined ? { areaM2 } : {}),
        ...(processStage !== undefined ? { processStage } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(file2dUrl !== undefined ? { file2dUrl } : {}),
        ...(file3dUrl !== undefined ? { file3dUrl } : {}),
        ...(sharepointLink !== undefined ? { sharepointLink } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        quantity: quantity ?? 1,
        ...(assetId !== undefined ? { assetId } : {}),
      },
      include: { asset: true },
    });
    res.status(201).json(withAssetUrls(product));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /:id — update product
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const {
      name, code, weightKg, areaM2, processStage,
      category, color, file2dUrl, file3dUrl, sharepointLink, metadata, quantity, assetId
    } = req.body as {
      name?: string; code?: string; weightKg?: number; areaM2?: number;
      processStage?: string; category?: string; color?: string;
      file2dUrl?: string; file3dUrl?: string; sharepointLink?: string;
      metadata?: object; quantity?: number; assetId?: string;
    };
    const product = await prisma.product.update({
      where: { id: String(req.params.id) },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(weightKg !== undefined ? { weightKg } : {}),
        ...(areaM2 !== undefined ? { areaM2 } : {}),
        ...(processStage !== undefined ? { processStage } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(file2dUrl !== undefined ? { file2dUrl } : {}),
        ...(file3dUrl !== undefined ? { file3dUrl } : {}),
        ...(sharepointLink !== undefined ? { sharepointLink } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        ...(quantity !== undefined ? { quantity } : {}),
        ...(assetId !== undefined ? { assetId } : {}),
      },
      include: { asset: true },
    });
    res.json(withAssetUrls(product));
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
