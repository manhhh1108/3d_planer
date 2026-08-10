import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['.dwg', '.dxf', '.step', '.stp', '.ifc', '.glb', '.gltf', '.obj', '.png', '.jpg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported`));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 },
});

const router = Router();

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    filename: req.file.filename,
    originalname: req.file.originalname,
    path: `/uploads/${req.file.filename}`,
    size: req.file.size,
  });
});

router.get('/list', (_req, res) => {
  const files = fs.readdirSync(uploadDir).map((f) => ({
    filename: f,
    path: `/uploads/${f}`,
    size: fs.statSync(path.join(uploadDir, f)).size,
  }));
  res.json(files);
});

export default router;
