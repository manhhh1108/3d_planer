import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { dxfToSvg } from '../server/cad/convertDxfSvg.js';

const fixture = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'box.dxf'), 'utf8');

describe('dxfToSvg', () => {
  it('converts box.dxf to SVG with correct dimensions from $INSUNITS', () => {
    const result = dxfToSvg(fixture, undefined);
    expect(result.widthM).toBeCloseTo(4, 3);
    expect(result.heightM).toBeCloseTo(2, 3);
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('viewBox="0 0 4 2"');
    expect(result.svg).toContain('<polygon');
  });

  it('explicit unitScale overrides $INSUNITS', () => {
    const result = dxfToSvg(fixture, 0.01);
    expect(result.widthM).toBeCloseTo(40, 2);
    expect(result.heightM).toBeCloseTo(20, 2);
  });

  it('throws on DXF with no geometry', () => {
    expect(() => dxfToSvg('0\nEOF\n', undefined)).toThrow(/no geometry/i);
  });

  it('renders LINE entities and correct bounding box', () => {
    const dxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n3.0\n21\n1.0\n31\n0.0\n0\nENDSEC\n0\nEOF\n`;
    const result = dxfToSvg(dxf, undefined);
    expect(result.widthM).toBeCloseTo(3, 3);
    expect(result.heightM).toBeCloseTo(1, 3);
    expect(result.svg).toContain('<line');
  });

  it('renders ARC entities with correct cardinal-axis bounding box', () => {
    // Full circle arc: from 0° to 360° (span=360), center=(0,0), r=1m, INSUNITS=6 (meters)
    // Cardinal points: right(1,0), top(0,1), left(-1,0), bottom(0,-1)
    // widthM should be 2 (from -1 to 1), heightM should be 2
    const dxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nARC\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n40\n1.0\n50\n0.0\n51\n360.0\n0\nENDSEC\n0\nEOF\n`;
    const result = dxfToSvg(dxf, undefined);
    expect(result.widthM).toBeCloseTo(2, 1);
    expect(result.heightM).toBeCloseTo(2, 1);
    expect(result.svg).toContain('<path');
  });
});
