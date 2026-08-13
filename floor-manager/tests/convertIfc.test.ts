import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ifcToMeshes } from '../server/cad/convertIfc.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'box.ifc');
const hasFixture = fs.existsSync(FIXTURE);

describe('ifcToMeshes', () => {
  it.skipIf(!hasFixture)('reads an IFC file into transformed triangle meshes', async () => {
    const buf = fs.readFileSync(FIXTURE);
    const meshes = await ifcToMeshes(buf);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes[0].positions.length % 3).toBe(0);
    expect(meshes[0].indices.length % 3).toBe(0);
  });

  it('rejects with a clear error on garbage input', { timeout: 30000 }, async () => {
    await expect(ifcToMeshes(Buffer.from('not an ifc'))).rejects.toThrow(/IFC/i);
  });
});
