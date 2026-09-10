import fs from 'fs';
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

/**
 * Ảnh xem trước của một snapshot. Đặt dưới thư mục layout để xoá layout là dọn
 * luôn, và tên file cố định theo snapshot nên lưu lại chỉ ghi đè, không sinh
 * file mới mỗi lần autosave.
 */
export function snapshotThumbPaths(layoutId: string, snapshotId: string) {
  const dir = path.resolve(UPLOAD_DIR, 'layouts', layoutId, 'snapshots');
  return {
    dir,
    file: path.join(dir, `${snapshotId}.jpg`),
    url: `/uploads/layouts/${layoutId}/snapshots/${snapshotId}.jpg`,
  };
}

/** Logo công ty của một mặt bằng — in vào khung tên bản vẽ */
export function siteLogoPaths(siteId: string, ext: string) {
  const dir = path.resolve(UPLOAD_DIR, 'sites', siteId);
  return {
    dir,
    file: path.join(dir, `logo.${ext}`),
    url: `/uploads/sites/${siteId}/logo.${ext}`,
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
    // Nền tải lên dạng ảnh thì giữ nguyên định dạng gốc, không qua bước dựng SVG
    bgImageFile: (ext: string) => path.join(artifactDir, `background.${ext}`),
    bgImageUrl: (ext: string) => `/uploads/layouts/${layoutId}/background.${ext}`,
  };
}

/**
 * Xoá đúng các file nền của một layout, GIỮ NGUYÊN thư mục con `snapshots/`.
 *
 * Ảnh xem trước của snapshot nằm bên trong thư mục artifact của layout, nên
 * `rmSync(artifactDir, { recursive: true })` lúc đổi/xoá nền sẽ cuốn theo toàn
 * bộ ảnh đó trong khi cột `thumbnail` trong DB vẫn trỏ tới chúng — người dùng
 * nhận 404 ở trang mặt bằng. Chỉ xoá layout mới được quét cả cụm.
 *
 * Nền chỉ có thể là `background.svg` (dựng từ DXF/DWG) hoặc `background.<ext>`
 * (ảnh tải thẳng), nên khớp theo tiền tố là đủ và không đụng thứ gì khác.
 */
export function removeLayoutBgFiles(layoutId: string): void {
  const { artifactDir } = layoutBgPaths(layoutId);
  let names: string[];
  try {
    names = fs.readdirSync(artifactDir);
  } catch {
    return; // chưa từng có nền
  }
  for (const name of names) {
    if (name.startsWith('background.')) {
      fs.rmSync(path.join(artifactDir, name), { force: true });
    }
  }
}
