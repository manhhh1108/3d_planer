import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LayoutPDFData {
  projectName: string;
  layoutName: string;
  date: string;
  canvasImage: string;
  positions: Array<{
    name: string;
    code: string;
    x: number;
    y: number;
    areaM2: number;
    weightKg: number;
    processStage: string;
  }>;
  totalArea: number;
  layoutArea: number;
  usageRate: number;
}

export function exportLayoutPDF(data: LayoutPDFData) {
  const doc = new jsPDF('landscape', 'mm', 'a3');

  doc.setFontSize(18);
  doc.text(data.projectName, 14, 20);
  doc.setFontSize(12);
  doc.text(`Mat bang: ${data.layoutName} | Ngay: ${data.date}`, 14, 28);

  if (data.canvasImage) {
    doc.addImage(data.canvasImage, 'PNG', 14, 35, 380, 180);
  }

  autoTable(doc, {
    startY: 220,
    head: [['STT', 'San pham', 'Ma', 'Vi tri (X,Y)', 'DT (m2)', 'KL (kg)', 'Cong doan']],
    body: data.positions.map((p, i) => [
      i + 1,
      p.name,
      p.code,
      `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`,
      p.areaM2?.toFixed(1) ?? '-',
      p.weightKg?.toFixed(1) ?? '-',
      p.processStage ?? '-',
    ]),
    foot: [['', '', '', 'Tong', data.totalArea.toFixed(1), '', '']],
    theme: 'grid',
    styles: { fontSize: 9 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.text(`Tong dien tich chiem: ${data.totalArea.toFixed(1)} m2 | Dien tich mat bang: ${data.layoutArea.toFixed(1)} m2 | Ty le su dung: ${data.usageRate.toFixed(1)}%`, 14, finalY);

  doc.save(`${data.layoutName}_${data.date}.pdf`);
}

interface ReportPDFData {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  footer?: (string | number)[];
}

export function exportReportPDF(data: ReportPDFData) {
  const doc = new jsPDF('landscape', 'mm', 'a4');

  doc.setFontSize(16);
  doc.text(data.title, 14, 20);

  autoTable(doc, {
    startY: 30,
    head: [data.headers],
    body: data.rows,
    foot: data.footer ? [data.footer] : undefined,
    theme: 'grid',
    styles: { fontSize: 9 },
  });

  doc.save(`${data.title.replace(/\s+/g, '_')}.pdf`);
}
