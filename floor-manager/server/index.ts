import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import projectsRouter from './routes/projects.js';
import productsRouter from './routes/products.js';
import layoutsRouter from './routes/layouts.js';
import snapshotsRouter from './routes/snapshots.js';
import reportsRouter from './routes/reports.js';
import filesRouter from './routes/files.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(import.meta.dirname, '../uploads')));

app.use('/api/projects', projectsRouter);
app.use('/api/products', productsRouter);
app.use('/api/layouts', layoutsRouter);
app.use('/api/snapshots', snapshotsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/files', filesRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
