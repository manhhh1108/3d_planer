import type { CadMesh } from './geometry.js';

// occt-import-js là module WASM khởi tạo async; cache instance.
let occtPromise: Promise<any> | null = null;
async function getOcct(): Promise<any> {
  if (!occtPromise) {
    const mod = await import('occt-import-js');
    const factory = (mod as any).default ?? mod;
    occtPromise = factory();
  }
  return occtPromise;
}

/** Đọc STEP/STP buffer thành danh sách mesh tam giác (tọa độ = đơn vị file, Z-up). */
export async function stepToMeshes(fileBuffer: Buffer): Promise<CadMesh[]> {
  const occt = await getOcct();
  const result = occt.ReadStepFile(new Uint8Array(fileBuffer), null);
  if (!result || !result.success || !result.meshes?.length) {
    throw new Error('STEP read failed: file is not a valid STEP model or contains no solids');
  }
  return result.meshes.map((m: any) => ({
    positions: new Float32Array(m.attributes.position.array),
    indices: new Uint32Array(m.index.array),
  }));
}
