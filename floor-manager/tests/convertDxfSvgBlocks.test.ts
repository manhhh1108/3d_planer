import { describe, it, expect } from 'vitest';
import { dxfToSvg } from '../server/cad/convertDxfSvg.js';

/** DXF tối thiểu: 1 block "BOX" chứa 1 LINE, đặt vào modelspace qua INSERT. */
function dxfWithBlock(insert: string): string {
  return [
    '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC',
    '0\nSECTION\n2\nBLOCKS',
    '0\nBLOCK\n8\n0\n2\nBOX\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0\n3\nBOX\n1\n',
    '0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n2.0\n21\n0.0\n31\n0.0',
    '0\nENDBLK\n8\n0',
    '0\nENDSEC',
    '0\nSECTION\n2\nENTITIES',
    insert,
    '0\nENDSEC\n0\nEOF\n',
  ].join('\n');
}

describe('dxfToSvg — block expansion', () => {
  it('vẽ nội dung block được tham chiếu qua INSERT', () => {
    const r = dxfToSvg(dxfWithBlock('0\nINSERT\n8\n0\n2\nBOX\n10\n0.0\n20\n0.0\n30\n0.0'), undefined);
    expect(r.svg).toContain('<line');
    expect(r.widthM).toBeCloseTo(2, 3);
  });

  it('áp dụng scale của INSERT lên hình học trong block', () => {
    // xScale (41) = 3 -> line dài 2m thành 6m
    const r = dxfToSvg(dxfWithBlock('0\nINSERT\n8\n0\n2\nBOX\n10\n0.0\n20\n0.0\n30\n0.0\n41\n3.0\n42\n1.0'), undefined);
    expect(r.widthM).toBeCloseTo(6, 3);
  });

  it('áp dụng rotation của INSERT lên hình học trong block', () => {
    // rotation (50) = 90 độ -> line ngang 2m thành dọc 2m
    const r = dxfToSvg(dxfWithBlock('0\nINSERT\n8\n0\n2\nBOX\n10\n0.0\n20\n0.0\n30\n0.0\n50\n90.0'), undefined);
    expect(r.widthM).toBeCloseTo(0, 3);
    expect(r.heightM).toBeCloseTo(2, 3);
  });

  it('bbox tính theo vị trí đặt block, không phải gốc toạ độ block', () => {
    const r = dxfToSvg(dxfWithBlock('0\nINSERT\n8\n0\n2\nBOX\n10\n10.0\n20\n0.0\n30\n0.0'), undefined);
    // line từ x=10 đến x=12 -> rộng 2m
    expect(r.widthM).toBeCloseTo(2, 3);
  });
});

describe('dxfToSvg — ELLIPSE và SPLINE', () => {
  it('vẽ ELLIPSE', () => {
    const dxf = '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'
      + '0\nELLIPSE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n2.0\n21\n0.0\n31\n0.0\n40\n0.5\n41\n0.0\n42\n6.283185307179586\n'
      + '0\nENDSEC\n0\nEOF\n';
    const r = dxfToSvg(dxf, undefined);
    expect(r.widthM).toBeCloseTo(4, 1);
    expect(r.heightM).toBeCloseTo(2, 1);
  });

  it('vẽ SPLINE', () => {
    const dxf = '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'
      + '0\nSPLINE\n8\n0\n71\n1\n72\n4\n73\n2\n74\n0\n'
      + '40\n0.0\n40\n0.0\n40\n1.0\n40\n1.0\n'
      + '10\n0.0\n20\n0.0\n30\n0.0\n'
      + '10\n4.0\n20\n2.0\n30\n0.0\n'
      + '0\nENDSEC\n0\nEOF\n';
    const r = dxfToSvg(dxf, undefined);
    expect(r.widthM).toBeCloseTo(4, 1);
    expect(r.heightM).toBeCloseTo(2, 1);
  });
});

describe('dxfToSvg — kích thước ảnh', () => {
  it('SVG có width/height pixel để browser rasterize đúng độ phân giải', () => {
    const dxf = '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'
      + '0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n100.0\n21\n50.0\n31\n0.0\n'
      + '0\nENDSEC\n0\nEOF\n';
    const r = dxfToSvg(dxf, undefined);
    const m = r.svg.match(/^<svg[^>]*\swidth="(\d+)"\sheight="(\d+)"/);
    expect(m).not.toBeNull();
    const w = Number(m![1]), h = Number(m![2]);
    expect(w).toBeGreaterThanOrEqual(1000);
    // tỉ lệ ảnh phải khớp tỉ lệ bản vẽ, nếu không canvas kéo giãn sẽ méo
    expect(w / h).toBeCloseTo(r.widthM / r.heightM, 2);
  });
});
