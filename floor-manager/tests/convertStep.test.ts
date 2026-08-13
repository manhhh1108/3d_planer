import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { stepToMeshes } from '../server/cad/convertStep.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'box.step');
const hasFixture = fs.existsSync(FIXTURE);

describe('stepToMeshes', () => {
  it.skipIf(!hasFixture)('reads a STEP file into triangle meshes', async () => {
    const buf = fs.readFileSync(FIXTURE);
    const meshes = await stepToMeshes(buf);
    expect(meshes.length).toBeGreaterThan(0);
    const m = meshes[0];
    expect(m.positions.length % 3).toBe(0);
    expect(m.indices.length % 3).toBe(0);
    expect(m.positions.length).toBeGreaterThan(0);
  });

  it('rejects with a clear error on garbage input', async () => {
    await expect(stepToMeshes(Buffer.from('not a step file'))).rejects.toThrow(/STEP/i);
  });
});
