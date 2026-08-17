import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import authRouter from './routes/auth.js';
import projectsRouter from './routes/projects.js';
import productsRouter from './routes/products.js';
import layoutsRouter from './routes/layouts.js';
import snapshotsRouter from './routes/snapshots.js';
import reportsRouter from './routes/reports.js';
import filesRouter from './routes/files.js';
import sitesRouter from './routes/sites.js';
import assetsRouter from './routes/assets.js';
import usersRouter from './routes/users.js';
import dashboardRouter from './routes/dashboard.js';
import plansRouter from './routes/plans.js';
import commentsRouter from './routes/comments.js';
import { requireAuth, requireRole, blockPending } from './middleware/auth.js';

const app = express();

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
    else cb(new Error('CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(import.meta.dirname, '../uploads')));

app.use('/api/auth', authRouter);
app.use('/api/users', requireAuth, blockPending, requireRole('ADMIN'), usersRouter);
app.use('/api/dashboard', requireAuth, blockPending, dashboardRouter);
app.use('/api/projects', requireAuth, blockPending, projectsRouter);
app.use('/api/products', requireAuth, blockPending, productsRouter);
app.use('/api/sites', requireAuth, blockPending, sitesRouter);
app.use('/api/layouts', requireAuth, blockPending, layoutsRouter);
app.use('/api/plans', requireAuth, blockPending, plansRouter);
app.use('/api/comments', requireAuth, blockPending, commentsRouter);
app.use('/api/snapshots', requireAuth, blockPending, snapshotsRouter);
app.use('/api/reports', requireAuth, blockPending, reportsRouter);
app.use('/api/files', requireAuth, blockPending, filesRouter);
app.use('/api/assets', requireAuth, blockPending, assetsRouter);

export default app;
