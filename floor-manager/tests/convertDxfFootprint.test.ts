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
