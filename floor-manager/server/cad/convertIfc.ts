import type { CadMesh } from './geometry.js';

let apiPromise: Promise<any> | null = null;
async function getIfcApi(): Promise<any> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const WebIFC = await import('web-ifc');
      const api = new (WebIFC as any).IfcAPI();
      await api.Init();
      return api;
    })();
  }
  return apiPromise;
}

/**
 * Đọc IFC buffer thành mesh tam giác đã áp transform (tọa độ Y-up theo web-ifc, đơn vị mét).
 */
export async function ifcToMeshes(fileBuffer: Buffer): Promise<CadMesh[]> {
  const api = await getIfcApi();
  let modelID: number | null = null;
  try {
    modelID = api.OpenModel(new Uint8Array(fileBuffer));
    const meshes: CadMesh[] = [];
    api.StreamAllMeshes(modelID, (flatMesh: any) => {
      const geometries = flatMesh.geometries;
      for (let i = 0; i < geometries.size(); i++) {
        const placed = geometries.get(i);
        const geom = api.GetGeometry(modelID, placed.geometryExpressID);
        const verts: Float32Array = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const idx: Uint32Array = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        const m: number[] = placed.flatTransformation;
        const positions = new Float32Array((verts.length / 6) * 3);
        // verts xen kẽ x,y,z,nx,ny,nz — áp ma trận 4x4 column-major
        for (let v = 0, p = 0; v < verts.length; v += 6, p += 3) {
          const x = verts[v], y = verts[v + 1], z = verts[v + 2];
          positions[p] = m[0] * x + m[4] * y + m[8] * z + m[12];
          positions[p + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          positions[p + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        meshes.push({ positions, indices: new Uint32Array(idx) });
      }
    });
    if (meshes.length === 0) throw new Error('IFC contains no meshable elements');
    return meshes;
  } catch (err) {
    throw new Error(`IFC read failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (modelID !== null) {
      try { api.CloseModel(modelID); } catch { /* noop */ }
    }
  }
}
