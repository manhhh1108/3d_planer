/**
 * Furniture Model Loader
 * Loads GLB models from /models/ for furniture items, with procedural fallback.
 * Models sourced from Kenney Furniture Kit (CC0).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { base } from '$app/paths';
import { createFurnitureModel } from './furnitureModels3d';
import type { FurnitureDef } from './furnitureCatalog';
import { scaleToFit, type ModelMapping } from './modelFit';

// Giống FILES_BASE trong services/api.ts: giữ nguyên /api để proxy forward được.
const FILES_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
  ? (import.meta.env.VITE_API_URL as string).replace(/\/$/, '')
  : 'http://localhost:4000/api';

const loader = new GLTFLoader();
const modelCache = new Map<string, THREE.Group>();
const loadingPromises = new Map<string, Promise<THREE.Group | null>>();

/**
 * Map our catalog IDs to Kenney GLB filenames (without extension).
 * Each entry can also specify scale/rotation adjustments.
 */

const MODEL_MAP: Record<string, ModelMapping> = {
  // Living Room
  sofa:           { file: 'loungeDesignSofa', scale: 110 },
  loveseat:       { file: 'loungeDesignSofa', scale: 100 },
  chair:          { file: 'loungeChair', scale: 95 },
  coffee_table:   { file: 'tableCoffee', scale: 100 },
  tv_stand:       { file: 'cabinetTelevision', scale: 100 },
  bookshelf:      { file: 'bookcaseOpen', scale: 100 },
  side_table:     { file: 'sideTable', scale: 80 },
  fireplace:      { file: 'toaster', scale: 100 }, // placeholder
  television:     { file: 'televisionModern', scale: 100 },
  storage:        { file: 'bookcaseClosed', scale: 100 },
  table:          { file: 'tableCross', scale: 100 },

  // Bedroom
  bed_queen:      { file: 'bedDouble', scale: 110 },
  bed_twin:       { file: 'bedSingle', scale: 100 },
  nightstand:     { file: 'cabinetBedDrawerTable', scale: 80 },
  dresser:        { file: 'cabinetBedDrawer', scale: 100 },
  wardrobe:       { file: 'bookcaseClosedDoors', scale: 110 },

  // Kitchen
  stove:          { file: 'kitchenStove', scale: 100 },
  fridge:         { file: 'kitchenFridgeLarge', scale: 100 },
  sink_k:         { file: 'kitchenSink', scale: 100 },
  counter:        { file: 'kitchenCabinet', scale: 100 },
  dishwasher:     { file: 'kitchenCabinetDrawer', scale: 100 },
  oven:           { file: 'kitchenStoveElectric', scale: 100 },

  // Bathroom
  toilet:         { file: 'toilet', scale: 100 },
  bathtub:        { file: 'bathtub', scale: 100 },
  shower:         { file: 'shower', scale: 100 },
  sink_b:         { file: 'bathroomSink', scale: 100 },
  washer_dryer:   { file: 'washerDryerStacked', scale: 100 },

  // Office
  desk:           { file: 'tableCross', scale: 110 },
  office_chair:   { file: 'chairDesk', scale: 90 },

  // Dining
  dining_table:   { file: 'tableCross', scale: 100 },
  dining_chair:   { file: 'chair', scale: 90 },

  // Decor
  potted_plant:   { file: 'pottedPlant', scale: 80 },
  floor_plant:    { file: 'plantSmall1', scale: 100 },

  // Outdoor Furniture
  fire_pit:       { file: 'outdoor_campfire_stones', scale: 100 },
  campfire:       { file: 'outdoor_campfire_logs', scale: 100 },
  tent:           { file: 'outdoor_tent_detailedOpen', scale: 100 },
  outdoor_sign:   { file: 'outdoor_sign', scale: 100 },
  outdoor_pot_large: { file: 'outdoor_pot_large', scale: 100 },
  outdoor_pot_small: { file: 'outdoor_pot_small', scale: 100 },

  // Landscaping — Trees
  tree_oak:       { file: 'outdoor_tree_oak', scale: 100 },
  tree_default:   { file: 'outdoor_tree_default', scale: 100 },
  tree_detailed:  { file: 'outdoor_tree_detailed', scale: 100 },
  tree_pine:      { file: 'outdoor_tree_pineRoundA', scale: 100 },
  tree_pine_tall: { file: 'outdoor_tree_pineTallA_detailed', scale: 100 },
  tree_palm:      { file: 'outdoor_tree_palm', scale: 100 },
  tree_palm_bend: { file: 'outdoor_tree_palmBend', scale: 100 },
  tree_palm_tall: { file: 'outdoor_tree_palmTall', scale: 100 },
  tree_fat:       { file: 'outdoor_tree_fat', scale: 100 },
  tree_simple:    { file: 'outdoor_tree_simple', scale: 100 },
  tree_thin:      { file: 'outdoor_tree_thin', scale: 100 },
  tree_tall:      { file: 'outdoor_tree_tall', scale: 100 },
  tree_cone:      { file: 'outdoor_tree_cone', scale: 100 },
  tree_blocky:    { file: 'outdoor_tree_blocks', scale: 100 },
  tree_small:     { file: 'outdoor_tree_small', scale: 100 },

  // Landscaping — Bushes & Plants
  bush:           { file: 'outdoor_plant_bush', scale: 100 },
  bush_detailed:  { file: 'outdoor_plant_bushDetailed', scale: 100 },
  bush_large:     { file: 'outdoor_plant_bushLarge', scale: 100 },
  bush_large_triangle: { file: 'outdoor_plant_bushLargeTriangle', scale: 100 },
  bush_small:     { file: 'outdoor_plant_bushSmall', scale: 100 },
  bush_triangle:  { file: 'outdoor_plant_bushTriangle', scale: 100 },
  cactus_short:   { file: 'outdoor_cactus_short', scale: 100 },
  cactus_tall:    { file: 'outdoor_cactus_tall', scale: 100 },
  hanging_moss:   { file: 'outdoor_hanging_moss', scale: 100 },

  // Landscaping — Flowers
  flower_purple:  { file: 'outdoor_flower_purpleA', scale: 100 },
  flower_red:     { file: 'outdoor_flower_redA', scale: 100 },
  flower_yellow:  { file: 'outdoor_flower_yellowA', scale: 100 },
  flower_purple_b: { file: 'outdoor_flower_purpleB', scale: 100 },
  flower_red_b:   { file: 'outdoor_flower_redB', scale: 100 },
  flower_yellow_b: { file: 'outdoor_flower_yellowB', scale: 100 },
  lily:           { file: 'outdoor_lily_large', scale: 100 },

  // Landscaping — Grass
  grass_tuft:     { file: 'outdoor_grass', scale: 100 },
  grass_large:    { file: 'outdoor_grass_large', scale: 100 },
  grass_leafs:    { file: 'outdoor_grass_leafs', scale: 100 },
  grass_leafs_large: { file: 'outdoor_grass_leafsLarge', scale: 100 },

  // Landscaping — Rocks & Stones
  rock_large:     { file: 'outdoor_rock_largeA', scale: 100 },
  rock_large_b:   { file: 'outdoor_rock_largeB', scale: 100 },
  rock_tall:      { file: 'outdoor_rock_tallA', scale: 100 },
  rock_small:     { file: 'outdoor_rock_smallA', scale: 100 },
  rock_small_b:   { file: 'outdoor_rock_smallB', scale: 100 },
  stone_large:    { file: 'outdoor_stone_largeA', scale: 100 },
  stone_tall:     { file: 'outdoor_stone_tallA', scale: 100 },

  // Landscaping — Misc
  mushroom_red:   { file: 'outdoor_mushroom_red', scale: 100 },
  mushroom_group: { file: 'outdoor_mushroom_redGroup', scale: 100 },
  mushroom_tan:   { file: 'outdoor_mushroom_tan', scale: 100 },
  log_single:     { file: 'outdoor_log', scale: 100 },
  log_large:      { file: 'outdoor_log_large', scale: 100 },
  log_stack:      { file: 'outdoor_log_stack', scale: 100 },
  stump_old:      { file: 'outdoor_stump_old', scale: 100 },
  stump_round:    { file: 'outdoor_stump_round', scale: 100 },
  corn:           { file: 'outdoor_crops_cornStageD', scale: 100 },
  pumpkin:        { file: 'outdoor_crop_pumpkin', scale: 100 },
  statue_column:  { file: 'outdoor_statue_column', scale: 100 },
  obelisk:        { file: 'outdoor_statue_obelisk', scale: 100 },

  // Fencing
  fence_simple:   { file: 'outdoor_fence_simple', scale: 100 },
  fence_planks:   { file: 'outdoor_fence_planks', scale: 100 },
  fence_gate:     { file: 'outdoor_fence_gate', scale: 100 },
  fence_corner:   { file: 'outdoor_fence_corner', scale: 100 },
};

/**
 * Load a GLB model for the given catalog ID.
 * Returns a clone from cache if available, or loads async.
 * Returns null if no GLB mapping exists.
 */
function loadGLBModel(catalogId: string): Promise<THREE.Group | null> {
  const mapping = MODEL_MAP[catalogId];
  if (!mapping) return Promise.resolve(null);

  const cacheKey = mapping.file;

  // Return cached clone
  if (modelCache.has(cacheKey)) {
    return Promise.resolve(modelCache.get(cacheKey)!.clone());
  }

  // Return existing loading promise — clone from cache (not from resolved value, which may be mutated)
  if (loadingPromises.has(cacheKey)) {
    return loadingPromises.get(cacheKey)!.then(() => modelCache.has(cacheKey) ? modelCache.get(cacheKey)!.clone() : null);
  }

  const promise = new Promise<THREE.Group | null>((resolve) => {
    loader.load(
      `${base}/models/${mapping.file}.glb`,
      (gltf) => {
        const group = new THREE.Group();
        // Clone the scene into our group
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        group.add(gltf.scene);
        modelCache.set(cacheKey, group);
        loadingPromises.delete(cacheKey);
        resolve(group.clone());
      },
      undefined,
      () => {
        // Load failed — fall back
        loadingPromises.delete(cacheKey);
        resolve(null);
      }
    );
  });

  loadingPromises.set(cacheKey, promise);
  return promise;
}

/**
 * Nạp mesh CAD do backend sinh, CÓ CACHE theo URL.
 *
 * Trước đây nhánh CAD tạo promise mới mỗi lần gọi nên cứ dựng lại scene 3D là
 * tải + parse lại toàn bộ .glb: đổi mặt tiếp sàn hay kéo thả một block cũng làm
 * MỌI block nháy về khối hộp thô rồi mới hiện lại hình thật. Cache theo URL cho
 * phép tái dùng ngay (xem thêm đường tắt đồng bộ ở createFurnitureModelWithGLB).
 *
 * Bản trong cache luôn giữ nguyên trạng; nơi dùng nhận một clone để tự do
 * scale/tô màu mà không ảnh hưởng các block khác.
 */
function loadCadModel(url: string): Promise<THREE.Group | null> {
  if (modelCache.has(url)) {
    return Promise.resolve(modelCache.get(url)!.clone());
  }
  if (loadingPromises.has(url)) {
    return loadingPromises.get(url)!.then(() =>
      modelCache.has(url) ? modelCache.get(url)!.clone() : null,
    );
  }

  const promise = new Promise<THREE.Group | null>((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const group = new THREE.Group();
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        group.add(gltf.scene);
        modelCache.set(url, group);
        loadingPromises.delete(url);
        resolve(group.clone());
      },
      undefined,
      () => {
        loadingPromises.delete(url);
        resolve(null);
      },
    );
  });

  loadingPromises.set(url, promise);
  return promise;
}

/**
 * Tô mesh CAD theo màu sản phẩm — cùng màu đang thấy ở 2D.
 *
 * GLB do backend sinh từ CAD không gắn vật liệu nào (xem server/cad/glb.ts).
 * Theo chuẩn glTF, primitive thiếu material dùng material mặc định với
 * metallicFactor = 1.0; trong three.js kim loại hoàn toàn mà không có
 * environment map thì render ra đen kịt — đó là lý do block CAD toàn màu đen.
 *
 * Cũng vá luôn hai chuyện hay gặp ở mesh CAD: thiếu pháp tuyến (không có thì
 * mất hoàn toàn khối) và mặt bị lật ngược (nên vẽ cả hai mặt).
 */
export function applyCadMaterial(model: THREE.Object3D, color: string): void {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;

    // KHÔNG dispose vật liệu cũ: mesh ở đây là clone từ bản cache, vật liệu
    // dùng CHUNG với bản gốc và mọi clone khác — giải phóng nó sẽ làm hỏng các
    // block đang hiển thị. Vật liệu gốc của GLB backend chỉ là material mặc
    // định của three, số lượng cố định nên không tích tụ.

    if (mesh.geometry && !mesh.geometry.getAttribute('normal')) {
      mesh.geometry.computeVertexNormals();
    }
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

/**
 * Scale a GLB model to match our catalog dimensions.
 * Kenney models are unit-scale (~1m tall). We need to match our cm dimensions.
 */
/**
 * Create a furniture model — tries GLB first, falls back to procedural.
 * Returns immediately with procedural model, then replaces with GLB when loaded.
 */
export function createFurnitureModelWithGLB(
  catalogId: string,
  def: FurnitureDef,
  onLoaded?: (model: THREE.Group) => void
): THREE.Group {
  const container = new THREE.Group();
  container.name = `furniture_${catalogId}`;

  // Xác định nguồn mesh trước — ưu tiên mesh CAD của sản phẩm, rồi tới model dựng sẵn.
  const cadUrl = def.file3dUrl
    ? (def.file3dUrl.startsWith('http') ? def.file3dUrl : `${FILES_BASE}${def.file3dUrl}`)
    : null;
  const mapping = MODEL_MAP[catalogId];
  const cacheKey = cadUrl ?? (mapping ? mapping.file : null);

  // Đã có trong cache thì dựng NGAY, bỏ qua hẳn bước khối hộp thô. Nhờ vậy đổi
  // mặt tiếp sàn hay kéo thả không còn làm block nháy về hình hộp rồi mới hiện
  // lại hình CAD.
  //
  // Không gọi onLoaded ở nhánh này: nơi gọi đang trong lúc gán biến `model` nên
  // callback sẽ thấy undefined. Không cần thiết — nơi gọi tự applyOrientation
  // ngay sau khi hàm này trả về.
  if (cacheKey && modelCache.has(cacheKey)) {
    const cached = modelCache.get(cacheKey)!.clone();
    if (cadUrl) {
      scaleToFit(cached, def, { file: 'cad', scale: 100 });
      applyCadMaterial(cached, def.color);
    } else if (mapping) {
      scaleToFit(cached, def, mapping);
    }
    container.add(cached);
    return container;
  }

  // Chưa có cache: hiện tạm khối hộp thô, thay bằng mesh thật khi tải xong.
  const procedural = createFurnitureModel(catalogId, def);
  container.add(procedural);

  const glbPromise = cadUrl ? loadCadModel(cadUrl) : mapping ? loadGLBModel(catalogId) : null;

  if (glbPromise) {
    glbPromise.then((glbModel) => {
      if (glbModel) {
        try {
          // Remove procedural and dispose its resources, then add GLB
          container.remove(procedural);
          procedural.traverse((obj: any) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
              else obj.material.dispose();
            }
          });
          if (cadUrl) {
            // KHÔNG xoay hình học CAD ở đây. Kích thước block do server tính từ
            // AABB của mesh LÚC IMPORT; xoay ở client làm AABB đổi trong khi bộ
            // số kia giữ nguyên, rồi scaleToFit kéo giãn từng trục để ép cho vừa
            // -> khối bị méo và nghiêng. Muốn nắn khối dựng lệch trục thì phải
            // nắn lúc import, để bbox tính ra từ mesh đã nắn.
            // CAD mesh is in meters, scale to cm to match our coordinate system
            scaleToFit(glbModel, def, { file: 'cad', scale: 100 });
            // Chỉ tô cho mesh CAD. Model Kenney có vật liệu/texture riêng, tô
            // đè lên sẽ làm chúng bệt màu.
            applyCadMaterial(glbModel, def.color);
          } else if (mapping) {
            scaleToFit(glbModel, def, mapping);
          }
          container.add(glbModel);
          onLoaded?.(container);
        } catch (err) {
          console.warn(`[FurnitureLoader] GLB error for ${catalogId}:`, err);
          container.add(procedural);
        }
      }
    });
  }

  return container;
}

/** Check if a catalog item has a GLB model available */
export function hasGLBModel(catalogId: string): boolean {
  return catalogId in MODEL_MAP;
}

/** Preload all mapped models */
export function preloadModels(): void {
  for (const catalogId of Object.keys(MODEL_MAP)) {
    loadGLBModel(catalogId);
  }
}
