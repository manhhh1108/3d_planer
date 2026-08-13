import { describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { meshesToGlb } from '../server/cad/glb.js';
import type { CadMesh } from '../server/cad/geometry.js';

function tri(): CadMesh {
  return {
    positions: new Float32Array([0, 0, 0, 1000, 0, 0, 0, 1000, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };
}

describe('meshesToGlb', () => {
  it('produces a parseable GLB with scaled, y-up positions', async () => {
    const glb = await meshesToGlb([tri()], 0.001, 'z');
    expect(glb.byteLength).toBeGreaterThan(20);
    // GLB magic 'glTF'
    expect(new TextDecoder().decode(glb.slice(0, 4))).toBe('glTF');

    const doc = await new NodeIO().readBinary(glb);
    const meshes = doc.getRoot().listMeshes();
    expect(meshes.length).toBe(1);
    const prim = meshes[0].listPrimitives()[0];
    const pos = prim.getAttribute('POSITION')!.getArray()!;
    // đỉnh (1000,0,0)*0.001, z-up -> y-up (x,z,-y): (1,0,0) giữ nguyên
    expect(pos[3]).toBeCloseTo(1, 5);
    // đỉnh (0,1000,0) -> (0, 0, -1)
    expect(pos[8]).toBeCloseTo(-1, 5);
  });

  it('keeps y-up meshes untouched apart from scaling', async () => {
    const glb = await meshesToGlb([tri()], 0.001, 'y');
    const doc = await new NodeIO().readBinary(glb);
    const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION')!.getArray()!;
    // (0,1000,0) -> (0,1,0)
    expect(pos[7]).toBeCloseTo(1, 5);
  });
});
