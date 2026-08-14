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
import { requireAuth } from './middleware/auth.js';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(import.meta.dirname, '../uploads')));

app.use('/api/auth', authRouter);
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/products', requireAuth, productsRouter);
app.use('/api/sites', requireAuth, sitesRouter);
app.use('/api/layouts', requireAuth, layoutsRouter);
app.use('/api/snapshots', requireAuth, snapshotsRouter);
app.use('/api/reports', requireAuth, reportsRouter);
app.use('/api/files', requireAuth, filesRouter);
app.use('/api/assets', requireAuth, assetsRouter);

export default app;
