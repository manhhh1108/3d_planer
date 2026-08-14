import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const STORAGE_DIR = process.env.STORAGE_DIR || './storage';

export function assetPaths(assetId: string, fileType?: string) {
  const sourceDir = path.resolve(STORAGE_DIR, 'sources', assetId);
  const artifactDir = path.resolve(UPLOAD_DIR, 'assets', assetId);
  return {
    sourceDir,
    artifactDir,
    sourceFile: fileType ? path.join(sourceDir, `source.${fileType}`) : undefined,
    footprintFile: path.join(artifactDir, 'footprint.json'),
    meshFile: path.join(artifactDir, 'mesh.glb'),
    thumbFile: path.join(artifactDir, 'thumb.svg'),
    footprintUrl: `/uploads/assets/${assetId}/footprint.json`,
    meshUrl: `/uploads/assets/${assetId}/mesh.glb`,
    thumbUrl: `/uploads/assets/${assetId}/thumb.svg`,
  };
}

export function layoutBgPaths(layoutId: string) {
  const sourceDir = path.resolve(STORAGE_DIR, 'sources', 'layouts', layoutId);
  const artifactDir = path.resolve(UPLOAD_DIR, 'layouts', layoutId);
  return {
    sourceDir,
    sourceFile: (ext: string) => path.join(sourceDir, `source.${ext}`),
    artifactDir,
    bgFile: path.join(artifactDir, 'background.svg'),
    bgUrl: `/uploads/layouts/${layoutId}/background.svg`,
  };
}
