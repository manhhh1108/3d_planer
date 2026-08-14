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
    expect(result.svg).toContain('viewBox="0 0 4');
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
});
