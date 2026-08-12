import { Document, NodeIO } from '@gltf-transform/core';
import type { CadMesh } from './geometry.js';

/**
 * Ghép CadMesh[] thành một GLB. unitScale đổi về mét.
 * upAxis 'z' (STEP): xoay về Y-up chuẩn glTF bằng (x,y,z) -> (x,z,-y).
 * upAxis 'y' (IFC/web-ifc): giữ nguyên trục.
 */
export async function meshesToGlb(
  meshes: CadMesh[],
  unitScale: number,
  upAxis: 'z' | 'y'
): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();

  for (const m of meshes) {
    const src = m.positions;
    const pos = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i] * unitScale;
      const y = src[i + 1] * unitScale;
      const z = src[i + 2] * unitScale;
      if (upAxis === 'z') {
        pos[i] = x;
        pos[i + 1] = z;
        pos[i + 2] = -y;
      } else {
        pos[i] = x;
        pos[i + 1] = y;
        pos[i + 2] = z;
      }
    }
    const position = doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer);
    const indices = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(
        m.indices instanceof Uint32Array
          ? (m.indices as Uint32Array<ArrayBuffer>)
          : new Uint32Array(m.indices)
      )
      .setBuffer(buffer);
    const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices);
    const mesh = doc.createMesh().addPrimitive(prim);
    scene.addChild(doc.createNode().setMesh(mesh));
  }

  return new NodeIO().writeBinary(doc);
}
