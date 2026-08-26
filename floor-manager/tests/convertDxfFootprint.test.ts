import { describe, it, expect } from 'vitest';
import { dxfToFootprint } from '../server/cad/convertDxf.js';

const HEADER = '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n';

/** Block "SHAPE" chứa 1 LWPOLYLINE kín 2×1 m, đặt vào modelspace qua INSERT. */
const DXF_BLOCK_ONLY = HEADER
  + '0\nSECTION\n2\nBLOCKS\n'
  + '0\nBLOCK\n8\n0\n2\nSHAPE\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0\n3\nSHAPE\n1\n\n'
  + '0\nLWPOLYLINE\n8\n0\n90\n4\n70\n1\n'
  + '10\n0.0\n20\n0.0\n10\n2.0\n20\n0.0\n10\n2.0\n20\n1.0\n10\n0.0\n20\n1.0\n'
  + '0\nENDBLK\n8\n0\n'
  + '0\nENDSEC\n'
  + '0\nSECTION\n2\nENTITIES\n'
  + '0\nINSERT\n8\n0\n2\nSHAPE\n10\n0.0\n20\n0.0\n30\n0.0\n'
  + '0\nENDSEC\n0\nEOF\n';

/** Chỉ có 1 CIRCLE — không LWPOLYLINE, không POLYLINE. */
const DXF_CIRCLE_ONLY = HEADER
  + '0\nSECTION\n2\nENTITIES\n'
  + '0\nCIRCLE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n40\n1.5\n'
  + '0\nENDSEC\n0\nEOF\n';

/** Mô hình 3D ACIS — dxf-parser bỏ qua 3DSOLID nên phải nhận diện từ text thô. */
const DXF_3DSOLID = HEADER
  + '0\nSECTION\n2\nENTITIES\n'
  + '0\n3DSOLID\n8\n0\n5\n2F0\n100\nAcDbModelerGeometry\n70\n1\n'
  + '0\nENDSEC\n0\nEOF\n';

describe('dxfToFootprint', () => {
  it('lấy được footprint từ hình học nằm trong block (INSERT)', () => {
    const fp = dxfToFootprint(DXF_BLOCK_ONLY, undefined);
    expect(fp.bbox.lengthM).toBeCloseTo(2, 3);
    expect(fp.bbox.widthM).toBeCloseTo(1, 3);
    expect(fp.areaM2).toBeCloseTo(2, 2);
  });

  it('lấy được footprint từ CIRCLE', () => {
    const fp = dxfToFootprint(DXF_CIRCLE_ONLY, undefined);
    expect(fp.bbox.lengthM).toBeCloseTo(3, 1);
    expect(fp.bbox.widthM).toBeCloseTo(3, 1);
    expect(fp.areaM2).toBeCloseTo(Math.PI * 1.5 * 1.5, 0);
  });

  it('báo đúng lỗi mô hình 3D thay vì "không chứa hình học 2D"', () => {
    expect(() => dxfToFootprint(DXF_3DSOLID, undefined)).toThrow(/STP|IFC/i);
  });

  it('vẫn báo lỗi rõ ràng khi file rỗng', () => {
    expect(() => dxfToFootprint('0\nEOF\n', undefined)).toThrow(/hình học 2D/i);
  });
});

/**
 * Bản vẽ cơ khí thật: biên dạng vẽ bằng LINE rời, thứ duy nhất khép kín là các
 * lỗ khoan. Dựng lại đúng hình dạng của 662-01.dwg (950 LINE + 312 CIRCLE).
 */
function partDrawnWithLines(): string {
  // Biên dạng 6 x 2 m ghép từ 4 đoạn LINE rời (không phải polyline kín)
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `0\nLINE\n8\n0\n10\n${x1}\n20\n${y1}\n30\n0.0\n11\n${x2}\n21\n${y2}\n31\n0.0\n`;
  // Lỗ khoan bán kính 2cm rải dọc chi tiết
  const hole = (x: number, y: number) =>
    `0\nCIRCLE\n8\n0\n10\n${x}\n20\n${y}\n30\n0.0\n40\n0.02\n`;

  let ents = line(0, 0, 6, 0) + line(6, 0, 6, 2) + line(6, 2, 0, 2) + line(0, 2, 0, 0);
  for (let i = 1; i <= 10; i++) ents += hole(i * 0.5, 1);

  return HEADER + '0\nSECTION\n2\nENTITIES\n' + ents + '0\nENDSEC\n0\nEOF\n';
}

/** Chi tiết vẽ bằng polyline kín 6x2 m, có thêm lỗ khoan */
function partDrawnWithClosedOutline(): string {
  const outline =
    '0\nLWPOLYLINE\n8\n0\n90\n4\n70\n1\n'
    + '10\n0.0\n20\n0.0\n10\n6.0\n20\n0.0\n10\n6.0\n20\n2.0\n10\n0.0\n20\n2.0\n';
  const hole = '0\nCIRCLE\n8\n0\n10\n3.0\n20\n1.0\n30\n0.0\n40\n0.05\n';
  return HEADER + '0\nSECTION\n2\nENTITIES\n' + outline + hole + '0\nENDSEC\n0\nEOF\n';
}

describe('dxfToFootprint — biên dạng vẽ bằng LINE', () => {
  it('KHÔNG bỏ LINE để chỉ lấy lỗ khoan', () => {
    const fp = dxfToFootprint(partDrawnWithLines(), undefined);
    // Trước bản vá: 10 polygon (10 lỗ), diện tích ~0.013 m²
    expect(fp.polygons.length).toBe(1);
    expect(fp.bbox.lengthM).toBeCloseTo(6, 2);
    expect(fp.bbox.widthM).toBeCloseTo(2, 2);
    expect(fp.areaM2).toBeGreaterThan(11); // ~12, không phải 0.013
  });

  it('lỗ khoan không được tính thành diện tích chi tiết', () => {
    const fp = dxfToFootprint(partDrawnWithLines(), undefined);
    expect(fp.areaM2).toBeGreaterThan(1);
  });

  it('vẽ bằng polyline kín thì vẫn dùng đúng đường bao đó, bỏ lỗ khoan', () => {
    const fp = dxfToFootprint(partDrawnWithClosedOutline(), undefined);
    expect(fp.polygons.length).toBe(1); // chỉ đường bao, không kèm lỗ
    expect(fp.bbox.lengthM).toBeCloseTo(6, 2);
    expect(fp.areaM2).toBeCloseTo(12, 1);
  });

  it('chỉ có mỗi đường tròn thì vẫn lấy đường tròn làm biên dạng', () => {
    const fp = dxfToFootprint(DXF_CIRCLE_ONLY, undefined);
    expect(fp.polygons.length).toBe(1);
    expect(fp.areaM2).toBeGreaterThan(6); // π*1.5² ≈ 7.07
  });
});
