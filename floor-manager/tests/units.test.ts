import { describe, it, expect } from 'vitest';
import { stepLengthScaleToMetre } from '../server/cad/units.js';

// Khối đơn vị + context tối giản kiểu STEP thật (unit không dùng bị bỏ qua).
function stepWith(unitBlocks: string, ctxIds: string): string {
  return `ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n${unitBlocks}\n#900=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNIT_ASSIGNED_CONTEXT((${ctxIds}))REPRESENTATION_CONTEXT('',''));\nENDSEC;\nEND-ISO-10303-21;\n`;
}

const MM = `#10=(\nLENGTH_UNIT()\nNAMED_UNIT(*)\nSI_UNIT(.MILLI.,.METRE.)\n);`;
const CM = `#11=(\nLENGTH_UNIT()\nNAMED_UNIT(*)\nSI_UNIT(.CENTI.,.METRE.)\n);`;
const M = `#12=(\nLENGTH_UNIT()\nNAMED_UNIT(*)\nSI_UNIT($,.METRE.)\n);`;
const RAD = `#13=(\nNAMED_UNIT(*)\nPLANE_ANGLE_UNIT()\nSI_UNIT($,.RADIAN.)\n);`;

describe('stepLengthScaleToMetre', () => {
  it('reads millimetre from the globally-assigned length unit', () => {
    expect(stepLengthScaleToMetre(stepWith(`${MM}\n${RAD}`, '#10,#13'))).toBe(0.001);
  });

  it('reads plain metre ($ prefix) as scale 1', () => {
    expect(stepLengthScaleToMetre(stepWith(`${M}\n${RAD}`, '#12,#13'))).toBe(1);
  });

  it('ignores a declared-but-unreferenced length unit (mm used, cm leftover)', () => {
    // Cả mm và cm được khai báo nhưng context chỉ tham chiếu #10 (mm)
    expect(stepLengthScaleToMetre(stepWith(`${MM}\n${CM}\n${RAD}`, '#10,#13'))).toBe(0.001);
  });

  it('reads centimetre when the context references it', () => {
    expect(stepLengthScaleToMetre(stepWith(`${MM}\n${CM}\n${RAD}`, '#11,#13'))).toBe(0.01);
  });

  it('reads inch from CONVERSION_BASED_UNIT', () => {
    const inch = `#14=(\nLENGTH_UNIT()\nNAMED_UNIT(#20)\nCONVERSION_BASED_UNIT('INCH',#21)\n);`;
    expect(stepLengthScaleToMetre(stepWith(`${inch}\n${RAD}`, '#14,#13'))).toBeCloseTo(0.0254, 6);
  });

  it('falls back to the sole length unit when there is no context', () => {
    const text = `DATA;\n${M}\nENDSEC;`;
    expect(stepLengthScaleToMetre(text)).toBe(1);
  });

  it('returns null when multiple length units and no context to disambiguate', () => {
    const text = `DATA;\n${MM}\n${CM}\nENDSEC;`;
    expect(stepLengthScaleToMetre(text)).toBeNull();
  });

  it('returns null when no length unit is present', () => {
    expect(stepLengthScaleToMetre('DATA;\n#1=CARTESIAN_POINT((0.,0.,0.));\nENDSEC;')).toBeNull();
  });
});
