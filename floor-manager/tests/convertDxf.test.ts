import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { dxfToFootprint } from '../server/cad/convertDxf.js';

const fixture = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'box.dxf'), 'utf8');

describe('dxfToFootprint', () => {
  it('parses closed LWPOLYLINE into a centered 4x2 m footprint using $INSUNITS', () => {
    const fp = dxfToFootprint(fixture, undefined);
    expect(fp.bbox.lengthM).toBeCloseTo(4, 3);
    expect(fp.bbox.widthM).toBeCloseTo(2, 3);
    expect(fp.bbox.heightM).toBe(0);
    expect(fp.areaM2).toBeCloseTo(8, 2);
    expect(fp.polygons.length).toBe(1);
  });

  it('explicit unitScale overrides $INSUNITS', () => {
    const fp = dxfToFootprint(fixture, 0.01); // coi số liệu là cm
    expect(fp.bbox.lengthM).toBeCloseTo(40, 2);
  });

  it('falls back to convex hull when no closed polyline exists', () => {
    const open = fixture.replace('70\n1\n', '70\n0\n'); // polyline mở
    const fp = dxfToFootprint(open, undefined);
    expect(fp.polygons.length).toBe(1);
    expect(fp.areaM2).toBeGreaterThan(0);
  });

  it('throws a clear error on empty drawing', () => {
    expect(() => dxfToFootprint('0\nEOF\n', undefined)).toThrow(/không chứa|no geometry/i);
  });
});
