import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { base } from '$app/paths';

const REGULAR_FILE = 'NotoSans-Regular.ttf';
const BOLD_FILE = 'NotoSans-Bold.ttf';
export const FONT_NAME = 'NotoSans';

async function loadFontBase64(file: string): Promise<string> {
  const res = await fetch(`${base}/fonts/${file}`);
  if (!res.ok) throw new Error(`Failed to load font: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** TTF chỉ cần tải một lần cho cả phiên — file nặng ~1 MB. */
const fontCache = new Map<string, Promise<string | null>>();

function fetchFontCached(file: string, required: boolean): Promise<string | null> {
  let p = fontCache.get(file);
  if (!p) {
    p = loadFontBase64(file).catch((err) => {
      if (required) throw err;
      return null;
    });
    fontCache.set(file, p);
  }
  return p;
}

/**
 * Nạp NotoSans vào tài liệu cho cả style normal lẫn bold.
 *
 * Thiếu style nào thì jsPDF im lặng rơi về Times (bảng mã WinAnsi) và mọi dấu
 * tiếng Việt trong phần đó hỏng hết — autoTable mặc định in đầu bảng và dòng
 * tổng ở style bold nên đây là chỗ hỏng dễ thấy nhất. Chưa có file Bold thì
 * dùng luôn file Regular cho style bold: chữ không đậm nhưng đọc được.
 */
export async function registerFont(doc: jsPDF): Promise<void> {
  const [regular, bold] = await Promise.all([
    fetchFontCached(REGULAR_FILE, true),
    fetchFontCached(BOLD_FILE, false),
  ]);

  doc.addFileToVFS(REGULAR_FILE, regular!);
  doc.addFont(REGULAR_FILE, FONT_NAME, 'normal');

  if (bold) {
    doc.addFileToVFS(BOLD_FILE, bold);
    doc.addFont(BOLD_FILE, FONT_NAME, 'bold');
  } else {
    doc.addFont(REGULAR_FILE, FONT_NAME, 'bold');
  }

  doc.setFont(FONT_NAME, 'normal');
}

export async function createPdf(): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await registerFont(doc);
  return doc;
}

export interface TitleBlockOptions {
  siteName: string;
  layoutName: string;
  snapshotDate: string;
  exportedBy: string;
  exportDate: string;
  title: string;
}

export function addTitleBlock(doc: jsPDF, opts: TitleBlockOptions): number {
  const { siteName, layoutName, snapshotDate, exportedBy, exportDate, title } = opts;
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont(FONT_NAME, 'normal');
  doc.setFontSize(14);
  doc.text('Floor Manager', 14, 12);

  doc.setFontSize(11);
  doc.text(title, 14, 19);

  doc.setFontSize(9);
  doc.text(`Site: ${siteName}`, 14, 26);
  doc.text(`Layout: ${layoutName}`, 14, 31);
  doc.text(`Ngày snapshot: ${snapshotDate}`, 14, 36);
  doc.text(`Người xuất: ${exportedBy}`, pageW / 2, 26);
  doc.text(`Ngày xuất: ${exportDate}`, pageW / 2, 31);

  doc.setDrawColor(150, 150, 150);
  doc.line(14, 39, pageW - 14, 39);

  return 43;
}

export interface FloorPlanPosition {
  x: number;
  y: number;
  product?: {
    code?: string | null;
    areaM2?: number | null;
    processStage?: string | null;
    metadata?: { widthM?: number; depthM?: number; heightM?: number } | null;
  } | null;
}

const STAGE_HEX: Record<string, string> = {
  'Hàn': '#f59e0b',
  'Sơn': '#22c55e',
  'Lắp ráp': '#3b82f6',
  'Cắt': '#ef4444',
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function drawFloorPlan(
  doc: jsPDF,
  positions: FloorPlanPosition[],
  layoutWidthM: number,
  layoutHeightM: number,
  startY: number,
  maxHeightMm = 100,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const drawW = pageW - 28;
  const scaleX = drawW / layoutWidthM;
  const scaleY = maxHeightMm / layoutHeightM;
  const scale = Math.min(scaleX, scaleY);
  const drawH = layoutHeightM * scale;

  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.4);
  doc.rect(14, startY, layoutWidthM * scale, drawH);

  doc.setFontSize(5);
  for (const pos of positions) {
    const meta = pos.product?.metadata;
    const area = pos.product?.areaM2 ?? 1;
    const bw = meta?.widthM ? meta.widthM * scale : Math.sqrt(area) * scale;
    const bh = meta?.depthM ? meta.depthM * scale : Math.sqrt(area) * scale;
    const bx = 14 + pos.x * scale;
    const by = startY + pos.y * scale;

    const stage = pos.product?.processStage ?? '';
    const hex = STAGE_HEX[stage] ?? '#94a3b8';
    const [r, g, b] = hexToRgb(hex);
    doc.setFillColor(r, g, b);
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.2);
    doc.rect(bx, by, Math.max(bw, 1), Math.max(bh, 1), 'FD');

    if (pos.product?.code) {
      doc.setTextColor(30, 30, 30);
      doc.text(pos.product.code.slice(0, 6), bx + 0.5, by + Math.min(bh, 3));
    }
  }

  const legendY = startY + drawH + 4;
  let legendX = 14;
  doc.setFontSize(7);
  doc.setTextColor(50, 50, 50);
  const stages = [...new Set(positions.map((p) => p.product?.processStage ?? 'Khác'))];
  for (const stage of stages) {
    const hex = STAGE_HEX[stage] ?? '#94a3b8';
    const [r, g, b] = hexToRgb(hex);
    doc.setFillColor(r, g, b);
    doc.rect(legendX, legendY, 4, 3, 'F');
    doc.text(stage, legendX + 5, legendY + 2.5);
    legendX += 30;
  }

  return legendY + 7;
}

export interface BlockRow {
  code: string;
  name: string;
  projectName: string;
  processStage: string;
  weightKg: number | null;
  areaM2: number | null;
}

export function addBlockTable(doc: jsPDF, rows: BlockRow[], startY: number): number {
  autoTable(doc, {
    startY,
    styles: { font: FONT_NAME, fontSize: 8 },
    headStyles: { font: FONT_NAME, fillColor: [51, 65, 85] },
    footStyles: { font: FONT_NAME, fillColor: [226, 232, 240] },
    head: [['Mã', 'Tên sản phẩm', 'Dự án', 'Công đoạn', 'Khối lượng (T)', 'Diện tích (m²)']],
    body: rows.map((r) => [
      r.code,
      r.name,
      r.projectName,
      r.processStage || '—',
      r.weightKg != null ? (r.weightKg / 1000).toFixed(2) : '—',
      r.areaM2 != null ? r.areaM2.toFixed(2) : '—',
    ]),
    foot: [[
      '', 'Tổng cộng', '', '',
      rows.reduce((s, r) => s + (r.weightKg ?? 0), 0) !== 0
        ? (rows.reduce((s, r) => s + (r.weightKg ?? 0), 0) / 1000).toFixed(2)
        : '—',
      rows.reduce((s, r) => s + (r.areaM2 ?? 0), 0).toFixed(2),
    ]],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable?.finalY ?? startY + 10;
}
