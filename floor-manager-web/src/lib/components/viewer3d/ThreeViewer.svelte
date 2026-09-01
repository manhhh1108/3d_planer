<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { activeFloor, currentProject, selectedElementId, draggingCatalogId, layoutBgFile, layoutDimsCm, layoutBgTransform } from '$lib/stores/project';
  import type { Floor } from '$lib/models/types';
  import { projectSettings } from '$lib/stores/settings';
  import * as THREE from 'three';
  import { DEFAULT_LAYOUT_BG_TRANSFORM, type LayoutBgTransform } from '$lib/utils/layoutBackground';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
  import { getCatalogItem, furnitureCatalog, furnitureCategories } from '$lib/utils/furnitureCatalog';
  import type { FurnitureDef } from '$lib/utils/furnitureCatalog';
  import { createFurnitureModel } from '$lib/utils/furnitureModels3d';
  import { createFurnitureModelWithGLB } from '$lib/utils/furnitureModelLoader';
  import { unorientDims } from '$lib/services/mapping';
  import { buildWallMesh } from '$lib/utils/wall3d';
  import { applyOrientation } from '$lib/utils/blockOrientation';
  import { decideCameraFit, initialCameraFitState, computeFitBox, type CameraFitState } from '$lib/utils/cameraFit';
  import { addFurniture, moveFurniture, remainingQuantity, quantityLimitHit } from '$lib/stores/project';
  import { propertiesPanelOpen } from '$lib/stores/ui';

  /**
   * Bảng thuộc tính (fixed, rộng 20rem) đè lên mép phải khung 3D. Khi nó mở,
   * mọi nút nổi neo phải phải dịch sang trái đúng bề rộng đó — nếu không thanh
   * công cụ sẽ nằm chồng lên hàng chọn màu và bấm không trúng.
   * Trên mobile bảng là sheet dưới đáy nên không cần né (chỉ áp dụng từ md).
   */
  let panelInset = $derived($propertiesPanelOpen ? 'md:right-[21rem]' : '');

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;

  // Dirty flag — only render when scene changes or camera moves
  let sceneDirty = true;
  function markSceneDirty() { sceneDirty = true; }
  let pointerControls: PointerLockControls;
  let animId: number;
  let currentFloor: Floor | null = null;
  let wallGroup: THREE.Group;

  // Nền DXF của layout (giống drawLayoutBackground ở canvas 2D) — mặt phẳng sàn ở top-view
  let bgPlane: THREE.Mesh | null = null;
  let bgUrl = $state<string | null>(null);
  let bgDimsCm = { widthCm: 0, heightCm: 0 };
  let bgT: LayoutBgTransform = { ...DEFAULT_LAYOUT_BG_TRANSFORM };
  /** Hiện tên block trong 3D — nhãn dày quá thì che mất bản thân khối */
  let showBlockLabels = $state(true);
  let showBgPlane = $state(true);

  // Raycasting for furniture/floor interaction in 3D
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // 3D Edit mode — enables click-to-select
  let editMode = $state(false);
  // Multi-floor stacking
  let showAllFloors = $state(false);
  const FLOOR_HEIGHT = 300; // cm — wall height + slab thickness

  // Walkthrough mode
  let walkthroughMode = $state(false);
  let moveForward = false;
  let moveBackward = false;
  let moveLeft = false;
  let moveRight = false;
  let lookLeft = false;
  let lookRight = false;
  let lookUp = false;
  let lookDown = false;
  let isShiftHeld = false;
  const LOOK_SPEED = 2.0; // radians/s
  let canJump = false;
  let velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let moveSpeed = $state(800); // cm/s
  let sprintSpeed = $state(1600); // cm/s
  let eyeHeight = $state(160); // cm

  // Lighting controls state
  let lightingPanelOpen = $state(false);
  let sunAzimuth = $state(135);      // 0-360 degrees
  let sunElevation = $state(60);     // 0-90 degrees
  let ambientIntensity = $state(0.35);
  let timeOfDay = $state<'morning' | 'noon' | 'evening' | 'night' | null>(null);

  // Light references
  let ambientLight: THREE.AmbientLight;
  let hemiLight: THREE.HemisphereLight;
  let sunLight: THREE.DirectionalLight;
  let fillLight: THREE.DirectionalLight;
  let rimLight: THREE.DirectionalLight;
  let skyCanvas: HTMLCanvasElement;
  let skyTexture: THREE.CanvasTexture;

  // Interior Camera placement
  let cameraPlacementMode = $state(false);
  let interiorCamera: THREE.PerspectiveCamera | null = null;
  let cameraHelper: THREE.Group | null = null;
  let cameraPosition = $state<{ x: number; y: number; z: number }>({ x: 0, y: 160, z: 0 });
  let cameraLookAt = $state<{ x: number; y: number; z: number }>({ x: 100, y: 120, z: 0 });
  let cameraFOV = $state(90);
  let cameraHeight = $state(160);
  let cameraPreviewOpen = $state(false);
  let cameraPreviewCanvas: HTMLCanvasElement | null = null;
  let cameraPreviewRenderer: THREE.WebGLRenderer | null = null;
  let cameraPlaced = $state(false);
  let cameraDragMode = $state<'position' | 'lookat' | null>(null);
  let cameraYaw = $state(0);   // degrees, 0 = initial direction
  let cameraPitch = $state(0); // degrees, negative = look down, positive = look up
  let cameraBaseDir = { x: 1, z: 0 }; // normalized direction from position to lookAt
  let cameraPreviewDirty = $state(false);
  let cameraXrayWalls = $state(false);
  let previewDragStart: { x: number; y: number; yaw: number; pitch: number } | null = null;
  let aiRenderOpen = $state(false);
  let aiRendering = $state(false);
  let aiRenderResult = $state<string | null>(null);
  let aiRenderError = $state<string | null>(null);
  let aiRenderStyle = $state('photorealistic');
  let aiRenderLighting = $state('natural daylight');
  let aiRenderMood = $state('warm and inviting');
  let aiRenderExtra = $state('');
  const STYLE_OPTIONS = ['photorealistic', 'architectural visualization', 'interior design magazine', 'minimalist', 'scandinavian', 'industrial', 'mid-century modern', 'luxury'];
  const LIGHTING_OPTIONS = ['natural daylight', 'warm afternoon', 'golden hour', 'soft ambient', 'dramatic shadows', 'bright and airy', 'moody evening', 'studio lighting'];
  const MOOD_OPTIONS = ['warm and inviting', 'clean and modern', 'cozy', 'elegant', 'rustic charm', 'sophisticated', 'relaxed', 'vibrant'];
  let aiProvider = $state<'gemini' | 'openai'>('gemini');
  let aiModel = $state('gemini-2.5-flash-image');
  const AI_MODELS = [
    { id: 'gemini-2.5-flash-image', name: 'Nano Banana (2.5 Flash)', desc: 'Fast & efficient image gen ✓' },
    { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro (3 Pro)', desc: 'Best quality, thinking, up to 4K ✓' },
  ];
  let openaiModel = $state('gpt-image-1');
  const OPENAI_MODELS = [
    { id: 'gpt-5.2', name: 'GPT-5.2', desc: 'Latest model' },
    { id: 'gpt-image-1', name: 'GPT Image 1', desc: 'Best image quality' },
    { id: 'gpt-4.1', name: 'GPT-4.1', desc: 'Vision + image gen' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', desc: 'Fast & affordable' },
  ];

  function buildAIPrompt(): string {
    let prompt = `Transform this interior 3D floor plan render into a ${aiRenderStyle} image. `;
    prompt += `Lighting: ${aiRenderLighting}. Mood: ${aiRenderMood}. `;
    prompt += `Keep the exact same room geometry, furniture placement, and camera angle. `;
    prompt += `Add realistic materials, textures, shadows, and reflections. `;
    prompt += `Make walls, floors, and furniture look like real materials (wood, fabric, metal, etc). `;
    if (aiRenderExtra.trim()) prompt += aiRenderExtra.trim() + ' ';
    prompt += `Do NOT change the room layout, furniture positions, or camera perspective.`;
    return prompt;
  }

  /** Capture scene from interior camera as base64 PNG */
  function captureSceneBase64(width: number, height: number): string {
    updateInteriorCamera();
    const offRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    offRenderer.setSize(width, height);
    offRenderer.shadowMap.enabled = false;
    offRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (cameraHelper) cameraHelper.visible = false;
    setSpritesVisible(false);
    offRenderer.render(scene!, interiorCamera!);
    if (cameraHelper) cameraHelper.visible = true;
    setSpritesVisible(true);
    const dataUrl = offRenderer.domElement.toDataURL('image/png');
    offRenderer.dispose();
    return dataUrl;
  }

  async function runAIRender() {
    if (!scene || !interiorCamera) return;

    if (aiProvider === 'gemini') {
      await runGeminiRender();
    } else {
      await runOpenAIRender();
    }
  }

  async function runGeminiRender() {
    const geminiKey = localStorage.getItem('o3d_gemini_key');
    if (!geminiKey) {
      alert('Please add your Gemini API key in Settings > AI tab first.');
      return;
    }
    
    aiRendering = true;
    aiRenderResult = null; aiRenderError = null;
    
    try {
      const imageDataUrl = captureSceneBase64(1024, 576);
      const base64Image = imageDataUrl.split(',')[1];
      const prompt = buildAIPrompt();
      
      const requestBody: any = {
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/png', data: base64Image } },
            { text: prompt }
          ]
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        }
      };
      requestBody.generationConfig.imageConfig = { aspectRatio: '16:9' };
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API error: ${response.status} — ${err}`);
      }
      
      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
      if (imagePart) {
        aiRenderResult = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
      } else {
        const textPart = parts.find((p: any) => p.text && !p.thought);
        throw new Error(textPart?.text || 'No image returned. Try a different model or prompt.');
      }
    } catch (e: any) {
      aiRenderError = e.message;
    } finally {
      aiRendering = false;
    }
  }

  async function runOpenAIRender() {
    const openaiKey = localStorage.getItem('o3d_openai_key');
    if (!openaiKey) {
      alert('Please add your OpenAI API key in Settings > AI tab first.');
      return;
    }
    
    aiRendering = true;
    aiRenderResult = null; aiRenderError = null;
    
    try {
      const imageDataUrl = captureSceneBase64(1024, 576);
      const base64Image = imageDataUrl.split(',')[1];
      const prompt = buildAIPrompt();

      // Use OpenAI Responses API with image_generation tool
      const requestBody = {
        model: openaiModel,
        input: [
          { role: 'user', content: [
            { type: 'input_image', image_url: `data:image/png;base64,${base64Image}` },
            { type: 'input_text', text: prompt }
          ]}
        ],
        tools: [{ type: 'image_generation', quality: 'high', size: '1536x1024' }]
      };
      
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error: ${response.status} — ${err}`);
      }
      
      const data = await response.json();
      const imageOutput = data.output?.find((o: any) => o.type === 'image_generation_call');
      if (imageOutput?.result) {
        aiRenderResult = `data:image/png;base64,${imageOutput.result}`;
      } else {
        const textOutput = data.output?.find((o: any) => o.type === 'message');
        const msg = textOutput?.content?.[0]?.text || JSON.stringify(data.output);
        throw new Error(`No image returned. Response: ${msg}`);
      }
    } catch (e: any) {
      aiRenderError = e.message;
    } finally {
      aiRendering = false;
    }
  }

  function downloadAIRender() {
    if (!aiRenderResult) return;
    const link = document.createElement('a');
    const projectName = get(currentProject)?.name ?? 'floorplan';
    link.download = `${projectName}-ai-render.png`;
    link.href = aiRenderResult;
    link.click();
  }

  /** Move camera in the XZ plane relative to current facing direction.
   *  forward/right are in camera-local space (forward = facing dir, right = perpendicular). */
  function moveCameraRelative(forward: number, right: number) {
    const yawRad = cameraYaw * Math.PI / 180;
    const cos = Math.cos(yawRad);
    const sin = Math.sin(yawRad);
    // Current facing direction (rotated baseDir by yaw)
    const fwdX = cameraBaseDir.x * cos - cameraBaseDir.z * sin;
    const fwdZ = cameraBaseDir.x * sin + cameraBaseDir.z * cos;
    // Right is perpendicular to forward in XZ
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const dx = fwdX * forward + rightX * right;
    const dz = fwdZ * forward + rightZ * right;
    cameraPosition = { ...cameraPosition, x: cameraPosition.x + dx, z: cameraPosition.z + dz };
    updateCameraMarkerFromState();
    cameraPreviewDirty = true;
  }

  /** Rebuild the 3D camera marker to match current yaw/pitch/position state */
  function updateCameraMarkerFromState() {
    const yawRad = cameraYaw * Math.PI / 180;
    const cos = Math.cos(yawRad);
    const sin = Math.sin(yawRad);
    const dirX = cameraBaseDir.x * cos - cameraBaseDir.z * sin;
    const dirZ = cameraBaseDir.x * sin + cameraBaseDir.z * cos;
    const lookDist = 200;
    createCameraMarker(
      new THREE.Vector3(cameraPosition.x, 0, cameraPosition.z),
      new THREE.Vector3(cameraPosition.x + dirX * lookDist, 0, cameraPosition.z + dirZ * lookDist)
    );
  }

  function createCameraMarker(pos: THREE.Vector3, lookAt: THREE.Vector3) {
    if (cameraHelper) wallGroup.remove(cameraHelper);
    cameraHelper = new THREE.Group();
    cameraHelper.name = 'interior_camera';

    // Camera body — small box
    const bodyGeo = new THREE.BoxGeometry(20, 15, 25);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.3, metalness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.copy(pos);
    body.position.y = cameraHeight;
    cameraHelper.add(body);

    // Lens — cylinder
    const lensGeo = new THREE.CylinderGeometry(6, 8, 10, 8);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.1, metalness: 0.7 });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.z = Math.PI / 2;
    const dir = new THREE.Vector3().subVectors(lookAt, pos).normalize();
    lens.position.copy(pos);
    lens.position.y = cameraHeight;
    lens.position.add(dir.clone().multiplyScalar(17));
    lens.lookAt(lookAt.x, cameraHeight, lookAt.z);
    lens.rotateX(Math.PI / 2);
    cameraHelper.add(lens);

    // Direction line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(pos.x, cameraHeight, pos.z),
      new THREE.Vector3(lookAt.x, cameraHeight * 0.75, lookAt.z)
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 2 });
    const line = new THREE.Line(lineGeo, lineMat);
    cameraHelper.add(line);

    // FOV cone wireframe
    const halfFov = (cameraFOV / 2) * Math.PI / 180;
    const coneLen = 150;
    const coneW = Math.tan(halfFov) * coneLen;
    const conePoints = [
      new THREE.Vector3(pos.x, cameraHeight, pos.z),
      new THREE.Vector3(pos.x + dir.x * coneLen + dir.z * coneW, cameraHeight, pos.z + dir.z * coneLen - dir.x * coneW),
      new THREE.Vector3(pos.x, cameraHeight, pos.z),
      new THREE.Vector3(pos.x + dir.x * coneLen - dir.z * coneW, cameraHeight, pos.z + dir.z * coneLen + dir.x * coneW),
    ];
    const coneGeo = new THREE.BufferGeometry().setFromPoints(conePoints);
    const coneLine = new THREE.LineSegments(coneGeo, new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.6 }));
    cameraHelper.add(coneLine);

    // Target marker — small sphere
    const targetGeo = new THREE.SphereGeometry(5, 8, 8);
    const targetMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.3 });
    const target = new THREE.Mesh(targetGeo, targetMat);
    target.position.set(lookAt.x, cameraHeight * 0.75, lookAt.z);
    cameraHelper.add(target);

    wallGroup.add(cameraHelper);
    markSceneDirty();
  }

  function updateInteriorCamera() {
    if (!interiorCamera) {
      interiorCamera = new THREE.PerspectiveCamera(cameraFOV, 16 / 9, 1, 5000);
    }
    interiorCamera.fov = cameraFOV;
    interiorCamera.position.set(cameraPosition.x, cameraHeight, cameraPosition.z);
    
    // Apply yaw (horizontal) and pitch (vertical) rotation to base direction
    const yawRad = cameraYaw * Math.PI / 180;
    const pitchRad = cameraPitch * Math.PI / 180;
    const cos = Math.cos(yawRad);
    const sin = Math.sin(yawRad);
    const dirX = cameraBaseDir.x * cos - cameraBaseDir.z * sin;
    const dirZ = cameraBaseDir.x * sin + cameraBaseDir.z * cos;
    const lookDist = 500;
    const lookY = cameraHeight + Math.tan(pitchRad) * lookDist;
    
    interiorCamera.lookAt(
      cameraPosition.x + dirX * lookDist,
      lookY,
      cameraPosition.z + dirZ * lookDist
    );
    interiorCamera.updateProjectionMatrix();
  }

  /** Set wall/ceiling/door meshes to transparent for x-ray preview.
   *  Saves original material state so it can be restored cleanly. */
  const xrayOriginals = new Map<THREE.Mesh, { transparent: boolean; opacity: number; depthWrite: boolean }>();
  function setWallsXray(xray: boolean) {
    if (!wallGroup) return;
    if (xray) {
      xrayOriginals.clear();
      wallGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh && !(obj instanceof THREE.Sprite)) {
          const mat = obj.material as THREE.MeshStandardMaterial;
          if (!mat) return;
          xrayOriginals.set(obj, { transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite });
          mat.transparent = true;
          mat.opacity = 0.12;
          mat.depthWrite = false;
          mat.needsUpdate = true;
        }
      });
    } else {
      for (const [mesh, orig] of xrayOriginals) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat) continue;
        mat.transparent = orig.transparent;
        mat.opacity = orig.opacity;
        mat.depthWrite = orig.depthWrite;
        mat.needsUpdate = true;
      }
      xrayOriginals.clear();
    }
  }

  /** Hide/show all label sprites in the scene (room names, etc.) */
  function setSpritesVisible(visible: boolean) {
    if (!scene) return;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Sprite)) return;
      // Bật lại thì nhãn block phải theo đúng công tắc người dùng đang đặt —
      // không thì chụp ảnh xong nhãn tự hiện lại dù đã tắt.
      obj.visible = visible && (obj.name !== 'block_name_label' || showBlockLabels);
    });
  }

  /** Áp công tắc hiện/ẩn tên block cho các nhãn đang có trong cảnh */
  function applyBlockLabelVisibility() {
    if (!scene) return;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Sprite && obj.name === 'block_name_label') {
        obj.visible = showBlockLabels;
      }
    });
    markSceneDirty();
  }

  function captureInteriorPhoto() {
    if (!scene || !interiorCamera) return;
    updateInteriorCamera();

    // Create high-res offscreen renderer
    const width = 1920;
    const height = 1080;
    const offRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    offRenderer.setSize(width, height);
    offRenderer.setPixelRatio(1);
    offRenderer.shadowMap.enabled = false;
    offRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    offRenderer.toneMappingExposure = 1.0;

    // Hide camera marker and room labels during capture
    if (cameraHelper) cameraHelper.visible = false;
    setSpritesVisible(false);
    if (cameraXrayWalls) setWallsXray(true);

    offRenderer.render(scene, interiorCamera);

    if (cameraHelper) cameraHelper.visible = true;
    setSpritesVisible(true);
    if (cameraXrayWalls) setWallsXray(false);

    const dataUrl = offRenderer.domElement.toDataURL('image/png');
    offRenderer.dispose();

    // Download
    const link = document.createElement('a');
    const projectName = get(currentProject)?.name ?? 'floorplan';
    link.download = `${projectName}-interior-photo.png`;
    link.href = dataUrl;
    link.click();
  }

  function renderCameraPreview() {
    if (!cameraPreviewCanvas || !scene) return;
    updateInteriorCamera();
    if (!interiorCamera) return;

    if (!cameraPreviewRenderer) {
      cameraPreviewRenderer = new THREE.WebGLRenderer({ canvas: cameraPreviewCanvas, antialias: true, alpha: false });
      cameraPreviewRenderer.shadowMap.enabled = false;
      cameraPreviewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      cameraPreviewRenderer.toneMappingExposure = 1.0;
    }
    cameraPreviewRenderer.setSize(384, 216);
    cameraPreviewRenderer.setPixelRatio(1);

    if (cameraHelper) cameraHelper.visible = false;
    setSpritesVisible(false);
    if (cameraXrayWalls) setWallsXray(true);
    cameraPreviewRenderer.render(scene, interiorCamera);
    if (cameraHelper) cameraHelper.visible = true;
    setSpritesVisible(true);
    if (cameraXrayWalls) setWallsXray(false);
    cameraPreviewDirty = false;
  }

  // Auto-render preview + update 3D marker when dirty flag is set
  $effect(() => {
    if (cameraPreviewDirty && cameraPreviewCanvas && cameraPlaced) {
      requestAnimationFrame(() => {
        updateCameraMarkerFromState();
        renderCameraPreview();
      });
    }
  });

  // 3D Furniture Placement
  let quantityLimitMsg = $state<string | null>(null);
  let quantityLimitTimer: ReturnType<typeof setTimeout> | null = null;
  quantityLimitHit.subscribe((hit) => {
    if (!hit) return;
    quantityLimitMsg = hit.elsewhere
      ? `Hết ${hit.quantity} bản "${hit.name}" — đang bố trí ở ${hit.elsewhere}`
      : `Đã đặt đủ ${hit.quantity} "${hit.name}" — hết số lượng cho phép`;
    if (quantityLimitTimer) clearTimeout(quantityLimitTimer);
    quantityLimitTimer = setTimeout(() => { quantityLimitMsg = null; }, 4000);
  });

  let furniturePlacementMode = $state(false);
  let furniturePickerOpen = $state(false);
  let selectedCatalogId = $state<string | null>(null);
  let furniturePickerCategory = $state<string>('Living Room');
  let ghostGroup: THREE.Group | null = null;
  let floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0 plane
  let ghostIntersection = new THREE.Vector3();

  // 3D furniture drag state
  let _dragFurnitureId: string | null = null;
  let _dragMesh: THREE.Object3D | null = null;
  let _dragLabel: HTMLDivElement | null = null;
  let _dragOffset = new THREE.Vector3(); // offset between click point and block center
  const DRAG_SNAP = 50;
  let _isDraggingBlock = false;

  function snapToGrid(val: number): number {
    return Math.round(val / DRAG_SNAP) * DRAG_SNAP;
  }

  const TIME_PRESETS = {
    morning: { azimuth: 90, elevation: 25, ambient: 0.3, sunColor: 0xffe0a0, sunIntensity: 0.8, skyTop: '#f5a86c', skyMid: '#fdd89b', skyHorizon: '#ffe8c0', hemiSky: '#fdd89b', hemiGround: '#9b8060' },
    noon:    { azimuth: 180, elevation: 80, ambient: 0.45, sunColor: 0xffffff, sunIntensity: 1.2, skyTop: '#3a7bd5', skyMid: '#87ceeb', skyHorizon: '#c8e8f8', hemiSky: '#87ceeb', hemiGround: '#8b7355' },
    evening: { azimuth: 270, elevation: 15, ambient: 0.2, sunColor: 0xff8040, sunIntensity: 0.6, skyTop: '#2d1b69', skyMid: '#c84e3c', skyHorizon: '#f4a460', hemiSky: '#c84e3c', hemiGround: '#4a3520' },
    night:   { azimuth: 0, elevation: 5, ambient: 0.08, sunColor: 0x8899cc, sunIntensity: 0.15, skyTop: '#0a0a2e', skyMid: '#141432', skyHorizon: '#1a1a3e', hemiSky: '#141432', hemiGround: '#0a0a15' },
  };

  function updateSunPosition() {
    if (!sunLight) return;
    const azRad = (sunAzimuth * Math.PI) / 180;
    const elRad = (sunElevation * Math.PI) / 180;
    const dist = 1500;
    sunLight.position.set(
      dist * Math.cos(elRad) * Math.sin(azRad),
      dist * Math.sin(elRad),
      dist * Math.cos(elRad) * Math.cos(azRad)
    );
    markSceneDirty();
  }

  function updateAmbientIntensity() {
    if (ambientLight) ambientLight.intensity = ambientIntensity;
    markSceneDirty();
  }

  function updateSkyGradient(topColor: string, midColor: string, horizonColor: string) {
    if (!skyCanvas || !skyTexture) return;
    const cx = skyCanvas.getContext('2d')!;
    const grad = cx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.4, midColor);
    grad.addColorStop(0.55, horizonColor);
    grad.addColorStop(0.7, '#d4cfc4');
    grad.addColorStop(1.0, '#b8b0a0');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, 4, 512);
    skyTexture.needsUpdate = true;
  }

  function applyTimePreset(preset: 'morning' | 'noon' | 'evening' | 'night') {
    const p = TIME_PRESETS[preset];
    timeOfDay = preset;
    sunAzimuth = p.azimuth;
    sunElevation = p.elevation;
    ambientIntensity = p.ambient;
    updateSunPosition();
    updateAmbientIntensity();
    if (sunLight) {
      sunLight.color.set(p.sunColor);
      sunLight.intensity = p.sunIntensity;
    }
    if (hemiLight) {
      hemiLight.color.set(p.hemiSky);
      hemiLight.groundColor.set(p.hemiGround);
      hemiLight.intensity = preset === 'night' ? 0.1 : 0.4;
    }
    if (fillLight) fillLight.intensity = preset === 'night' ? 0.05 : 0.4;
    if (rimLight) rimLight.intensity = preset === 'night' ? 0.05 : 0.25;
    updateSkyGradient(p.skyTop, p.skyMid, p.skyHorizon);
  }

  // Create a canvas-based floor texture
  function createFloorTexture(): THREE.CanvasTexture {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const cx = c.getContext('2d')!;
    // Hardwood pattern
    cx.fillStyle = '#c4a882';
    cx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 32) {
      for (let x = 0; x < size; x += 64) {
        const offset = (y / 32) % 2 === 0 ? 0 : 32;
        cx.fillStyle = y % 64 < 32 ? '#b89b72' : '#d4b892';
        cx.fillRect(x + offset, y, 62, 30);
        cx.strokeStyle = '#a08060';
        cx.lineWidth = 0.5;
        cx.strokeRect(x + offset, y, 62, 30);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    return tex;
  }

  function init() {
    scene = new THREE.Scene();

    // Sky dome — hemisphere with gradient texture mapped inside
    skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4; skyCanvas.height = 512;
    const cx = skyCanvas.getContext('2d')!;
    const grad = cx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#4a90d9');
    grad.addColorStop(0.3, '#87ceeb');
    grad.addColorStop(0.5, '#b8ddf0');
    grad.addColorStop(0.55, '#f0ece4');
    grad.addColorStop(0.7, '#d4cfc4');
    grad.addColorStop(1.0, '#b8b0a0');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, 4, 512);
    skyTexture = new THREE.CanvasTexture(skyCanvas);
    // Use as scene background (maps onto equirectangular projection)
    skyTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = skyTexture;

    // Ground plane — textured concrete with grid overlay
    const groundSize = 40000;
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    // Generate a subtle concrete texture with grid
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 1024; groundCanvas.height = 1024;
    const gctx = groundCanvas.getContext('2d')!;
    // Base concrete color with noise
    gctx.fillStyle = '#c8c2b8';
    gctx.fillRect(0, 0, 1024, 1024);
    // Add subtle noise for concrete feel
    for (let i = 0; i < 30000; i++) {
      const nx = Math.random() * 1024;
      const ny = Math.random() * 1024;
      const v = 180 + Math.random() * 30;
      gctx.fillStyle = `rgba(${v},${v-5},${v-12},0.15)`;
      gctx.fillRect(nx, ny, 2, 2);
    }
    // Grid lines every 128px (= 500cm real-world at current repeat)
    gctx.strokeStyle = 'rgba(0,0,0,0.08)';
    gctx.lineWidth = 1;
    const gridStep = 128;
    for (let x = 0; x <= 1024; x += gridStep) {
      gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, 1024); gctx.stroke();
    }
    for (let y = 0; y <= 1024; y += gridStep) {
      gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(1024, y); gctx.stroke();
    }
    // Thicker lines every 4 grid cells (= 2000cm / 20m)
    gctx.strokeStyle = 'rgba(0,0,0,0.15)';
    gctx.lineWidth = 2;
    for (let x = 0; x <= 1024; x += gridStep * 4) {
      gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, 1024); gctx.stroke();
    }
    for (let y = 0; y <= 1024; y += gridStep * 4) {
      gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(1024, y); gctx.stroke();
    }
    const groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(groundSize / 4000, groundSize / 4000);
    const groundMat = new THREE.MeshBasicMaterial({
      map: groundTex,
    });
    groundMat.polygonOffset = true;
    groundMat.polygonOffsetFactor = 2;
    groundMat.polygonOffsetUnits = 2;
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    scene.add(ground);

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1, 2000000);
    camera.position.set(800, 600, 800);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 100, 0);
    controls.maxPolarAngle = Math.PI / 2.05;
    // Mark dirty when orbit controls move the camera
    controls.addEventListener('change', markSceneDirty);

    // Click-to-select walls via raycasting
    let pointerDownPos = { x: 0, y: 0 };
    renderer.domElement.addEventListener('pointerdown', (e) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      // Drag detection: check if a furniture mesh was hit
      if (!furniturePlacementMode) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(wallGroup.children, true);
        if (hits.length > 0) {
          let obj: THREE.Object3D | null = hits[0].object;
          // Traverse up to the top-level furniture container (direct child of wallGroup)
          while (obj && obj.parent && obj.parent !== wallGroup) obj = obj.parent;
          if (obj?.userData.furnitureId) {
            _dragFurnitureId = obj.userData.furnitureId as string;
            _dragMesh = obj;
            _isDraggingBlock = false;
            // Save orbit state BEFORE disabling, then disable
            controls.saveState();
            controls.enabled = false;
            // Use the actual hit point on the block mesh (not floor plane) for precise offset
            const hitPt = hits[0].point;
            _dragOffset.set(obj.position.x - hitPt.x, 0, obj.position.z - hitPt.z);
            // Highlight dragged block
            obj.traverse((c: any) => {
              if (c.isMesh && c.material) {
                c.material = c.material.clone();
                c.material.opacity = 0.7;
                c.material.transparent = true;
              }
            });
            // Show coordinate label
            if (!_dragLabel) {
              _dragLabel = document.createElement('div');
              _dragLabel.style.cssText = 'position:fixed;z-index:9999;background:rgba(0,0,0,0.8);color:#fff;padding:4px 8px;border-radius:6px;font-size:11px;pointer-events:none;font-family:monospace';
              document.body.appendChild(_dragLabel);
            }
          }
        }
      }
    });
    renderer.domElement.addEventListener('pointerup', (e) => {
      // Commit 3D drag
      if (_dragFurnitureId) {
        if (_isDraggingBlock && _dragMesh) {
          const pos = _dragMesh.position;
          moveFurniture(_dragFurnitureId, { x: pos.x, y: pos.z });
        } else {
          // Bấm mà không kéo = chọn block, để panel thuộc tính mở ra (đó là
          // chỗ duy nhất chỉnh được cao độ).
          selectedElementId.set(_dragFurnitureId);
        }
        _dragFurnitureId = null;
        _dragMesh = null;
        _isDraggingBlock = false;
        if (_dragLabel) { _dragLabel.remove(); _dragLabel = null; }
        // Restore orbit controls to pre-drag state to prevent zoom/pan jump
        controls.reset();
        controls.enabled = true;
        return;
      }
      // Kéo chuột để xoay góc nhìn thì không tính là một cú click
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 5) return;
      if (walkthroughMode) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Bấm ra chỗ trống thì bỏ chọn. Phải chạy cả khi KHÔNG ở Edit Mode, vì
      // chọn block cũng chạy ngoài Edit Mode (nhánh _dragFurnitureId phía trên).
      // Cổng `if (!editMode) return` trước đây chặn mất khúc này: chọn được mà
      // bỏ chọn không được, nên panel thuộc tính đóng không nổi.
      if (raycaster.intersectObjects(wallGroup.children, true).length === 0) {
        selectedElementId.set(null);
      }

      // Đặt camera / đặt block là chức năng riêng của Edit Mode
      if (!editMode) return;

      // Camera placement mode: first click = position, second click = look-at target
      if (cameraPlacementMode) {
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(floorPlane, hit)) {
          if (!cameraPlaced) {
            // First click: place camera position
            cameraPosition = { x: hit.x, y: cameraHeight, z: hit.z };
            cameraLookAt = { x: hit.x + 200, y: cameraHeight * 0.75, z: hit.z };
            cameraBaseDir = { x: 1, z: 0 };
            cameraYaw = 0;
            cameraPitch = 0;
            cameraPlaced = true;
            updateInteriorCamera();
            createCameraMarker(new THREE.Vector3(hit.x, 0, hit.z), new THREE.Vector3(hit.x + 200, 0, hit.z));
            cameraPreviewOpen = true;
            cameraPreviewDirty = true;
          } else {
            // Second click: set look-at direction
            cameraLookAt = { x: hit.x, y: cameraHeight * 0.75, z: hit.z };
            const dx = hit.x - cameraPosition.x;
            const dz = hit.z - cameraPosition.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            cameraBaseDir = { x: dx / len, z: dz / len };
            cameraYaw = 0;
            cameraPitch = 0;
            updateInteriorCamera();
            createCameraMarker(
              new THREE.Vector3(cameraPosition.x, 0, cameraPosition.z),
              new THREE.Vector3(hit.x, 0, hit.z)
            );
            cameraPlacementMode = false;
            cameraPreviewDirty = true;
          }
        }
        return;
      }

      // Furniture placement mode: place on floor
      if (furniturePlacementMode && selectedCatalogId) {
        raycaster.setFromCamera(mouse, camera);
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(floorPlane, hit)) {
          // Convert 3D (x, z) to 2D (x, y)
          const pos2D = { x: hit.x, y: hit.z };
          const placedId = addFurniture(selectedCatalogId, pos2D);
          // Đặt nốt bản cuối (hoặc bị từ chối) thì thoát lệnh, không để người
          // dùng kẹt trong chế độ đặt mà click nào cũng trượt — giống 2D.
          if (!placedId || remainingQuantity(selectedCatalogId) <= 0) {
            furniturePlacementMode = false;
            selectedCatalogId = null;
            if (ghostGroup) { ghostGroup.visible = false; markSceneDirty(); }
          }
          // Scene will rebuild via store subscription
        }
        return;
      }

    });

    // Hover highlight in edit mode
    let hoveredMesh: THREE.Mesh | null = null;
    renderer.domElement.addEventListener('mousemove', (e) => {
      // 3D block drag — snap to grid + coordinate label
      if (_dragFurnitureId && _dragMesh) {
        _isDraggingBlock = true;
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(floorPlane, hit)) {
          const sx = snapToGrid(hit.x + _dragOffset.x);
          const sz = snapToGrid(hit.z + _dragOffset.z);
          _dragMesh.position.set(sx, _dragMesh.position.y, sz);
          if (_dragLabel) {
            _dragLabel.textContent = `x: ${(sx / 100).toFixed(1)}m  y: ${(sz / 100).toFixed(1)}m`;
            _dragLabel.style.left = (e.clientX + 16) + 'px';
            _dragLabel.style.top = (e.clientY - 30) + 'px';
          }
        }
        markSceneDirty();
        return;
      }

      // Furniture placement ghost preview
      if (editMode && furniturePlacementMode && selectedCatalogId) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(floorPlane, hit)) {
          if (!ghostGroup) {
            createGhostPreview(selectedCatalogId);
          }
          if (ghostGroup) {
            ghostGroup.position.set(hit.x, 1.5, hit.z);
            ghostGroup.visible = true;
          }
        } else if (ghostGroup) {
          ghostGroup.visible = false;
        }
        renderer.domElement.style.cursor = 'crosshair';
        return;
      } else if (ghostGroup) {
        ghostGroup.visible = false;
      }

      if (!editMode) {
        if (hoveredMesh) { hoveredMesh = null; renderer.domElement.style.cursor = ''; }
        return;
      }
      renderer.domElement.style.cursor = 'crosshair';
      hoveredMesh = null;
    });

    // Drag new block from BuildPanel into 3D scene
    renderer.domElement.addEventListener('dragover', (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('application/o3d-id')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const catalogId = get(draggingCatalogId);
      if (!catalogId) return;
      // Hết hạn mức thì báo ngay ở con trỏ, đừng để kéo tới tận lúc thả mới trượt
      if (remainingQuantity(catalogId) <= 0) {
        e.dataTransfer.dropEffect = 'none';
        if (ghostGroup) { ghostGroup.visible = false; markSceneDirty(); }
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(floorPlane, hit)) {
        if (!ghostGroup || ghostGroup.userData.catalogId !== catalogId) {
          createGhostPreview(catalogId);
          if (ghostGroup) ghostGroup.userData.catalogId = catalogId;
        }
        if (ghostGroup) {
          ghostGroup.position.set(snapToGrid(hit.x), 1.5, snapToGrid(hit.z));
          ghostGroup.visible = true;
        }
        markSceneDirty();
      }
    });

    renderer.domElement.addEventListener('dragleave', () => {
      if (ghostGroup) { ghostGroup.visible = false; markSceneDirty(); }
    });

    renderer.domElement.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      const catalogId = e.dataTransfer?.getData('application/o3d-id');
      if (!catalogId) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(floorPlane, hit)) {
        addFurniture(catalogId, { x: snapToGrid(hit.x), y: snapToGrid(hit.z) });
      }
      if (ghostGroup) { ghostGroup.visible = false; markSceneDirty(); }
    });

    // Initialize PointerLock controls for walkthrough mode
    pointerControls = new PointerLockControls(camera, renderer.domElement);
    
    // Keyboard event listeners for walkthrough
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    
    // ESC key to exit walkthrough mode
    pointerControls.addEventListener('unlock', () => {
      if (walkthroughMode) {
        exitWalkthroughMode();
      }
    });

    // Lights — đơn giản, chỉ cần hiển thị hình dạng rõ ràng
    ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    hemiLight = new THREE.HemisphereLight(0xffffff, 0xcccccc, 0.5);
    scene.add(hemiLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
    sunLight.position.set(500, 1200, 800);
    sunLight.castShadow = false;
    scene.add(sunLight);

    fillLight = sunLight; // giữ reference
    rimLight = sunLight;

    // Textured floor
    const floorTex = createFloorTexture();
    const floorGeo = new THREE.PlaneGeometry(4000, 4000);
    const floorMat = new THREE.MeshBasicMaterial({ map: floorTex, side: THREE.DoubleSide });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0.5;
    scene.add(floorMesh);

    wallGroup = new THREE.Group();
    scene.add(wallGroup);
  }

  function createGhostPreview(catalogId: string) {
    removeGhostPreview();
    const cat = getCatalogItem(catalogId);
    if (!cat || cat.symbol) return;
    const model = createFurnitureModelWithGLB(catalogId, cat, () => {
      if (renderer && scene && camera) renderer.render(scene, camera);
    });
    // Make semi-transparent
    model.traverse((child: any) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m: THREE.Material) => {
            const c = m.clone();
            if (c instanceof THREE.MeshStandardMaterial) {
              c.transparent = true;
              c.opacity = 0.5;
              c.emissive = new THREE.Color(0x4488ff);
              c.emissiveIntensity = 0.3;
            }
            return c;
          });
        } else {
          const c = child.material.clone();
          if (c instanceof THREE.MeshStandardMaterial) {
            c.transparent = true;
            c.opacity = 0.5;
            c.emissive = new THREE.Color(0x4488ff);
            c.emissiveIntensity = 0.3;
          }
          child.material = c;
        }
      }
    });
    model.visible = false;
    ghostGroup = model;
    scene.add(ghostGroup);
  }

  function removeGhostPreview() {
    if (ghostGroup) {
      scene.remove(ghostGroup);
      ghostGroup.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
          else obj.material.dispose();
        }
      });
      ghostGroup = null;
    }
  }

  // Cảnh 3D dựng lại sau MỌI thay đổi dữ liệu. Trước đây mỗi lần dựng lại đều
  // canh khung camera, nên đặt thêm một block là view bị thu nhỏ về mặc định
  // và người dùng phải zoom lại từ đầu. Chỉ canh khi thật sự cần.
  let cameraFitState: CameraFitState = initialCameraFitState;

  function autoCenterCamera(_floor: Floor) {
    // Center on scene objects (furniture) if any exist, else default position
    const box = computeFitBox(wallGroup, bgPlane);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.z, 200);
      controls.target.set(center.x, 0, center.z);
      camera.position.set(center.x + maxDim * 1.8, maxDim * 1.4, center.z + maxDim * 1.8);
      sunLight.position.set(center.x + 500, 1200, center.z + 800);
    } else {
      controls.target.set(0, 0, 0);
      camera.position.set(500, 700, 500);
    }
    controls.update();
  }

  function clearGroup(group: THREE.Group) {
    while (group.children.length) {
      const child = group.children[0];
      child.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const disposeMaterial = (m: any) => {
            if (m.map) m.map.dispose();
            m.dispose();
          };
          if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial);
          else disposeMaterial(obj.material);
        }
      });
      group.remove(child);
    }
  }

  function removeLayoutBackground() {
    if (!bgPlane) return;
    scene.remove(bgPlane);
    if (bgPlane.geometry) bgPlane.geometry.dispose();
    const mat = bgPlane.material as THREE.MeshBasicMaterial;
    if (mat.map) mat.map.dispose();
    mat.dispose();
    bgPlane = null;
  }

  /** Bội số vẽ dư của texture nhãn so với cỡ hiển thị */
  const LABEL_SUPERSAMPLE = 2;
  /** Chiều cao tối thiểu của khung nhãn trên màn hình (px) — chữ chiếm ~60% */
  const MIN_LABEL_PX = 22;
  /** Dùng lại một vector cho mọi nhãn, khỏi cấp phát mỗi khung hình */
  const labelWorldPos = new THREE.Vector3();

  function createBlockNameLabel(text: string): THREE.Sprite {
    const fontSize = 30;
    const paddingX = 18;
    const paddingY = 10;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const measureCanvas = document.createElement('canvas');
    const measureCx = measureCanvas.getContext('2d')!;
    measureCx.font = `600 ${fontSize}px Arial, sans-serif`;
    const textWidth = Math.ceil(measureCx.measureText(text).width);
    const width = textWidth + paddingX * 2;
    const height = fontSize + paddingY * 2;

    // Vẽ dư độ phân giải so với cỡ hiển thị: có dư mới còn chi tiết để mipmap
    // thu nhỏ dần cho mượt, và lúc camera lại gần cũng không bị phóng nhoè.
    const ss = dpr * LABEL_SUPERSAMPLE;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * ss);
    canvas.height = Math.ceil(height * ss);
    const cx = canvas.getContext('2d')!;
    cx.scale(ss, ss);
    cx.font = `600 ${fontSize}px Arial, sans-serif`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillStyle = 'rgba(17, 24, 39, 0.86)';
    const radius = 8;
    cx.beginPath();
    cx.roundRect(0, 0, width, height, radius);
    cx.fill();
    cx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    cx.lineWidth = 2;
    cx.stroke();
    cx.fillStyle = '#ffffff';
    cx.fillText(text, width / 2, height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Lùi camera ra là nhãn bị thu nhỏ mạnh; không có mipmap với lọc bất đẳng
    // hướng thì chữ vỡ thành hạt lấm tấm.
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'block_name_label';
    sprite.renderOrder = 999;
    // Block dựng lại sau khi đã tắt nhãn thì không được tự hiện lên
    sprite.visible = showBlockLabels;
    const baseW = width * 0.9;
    const baseH = height * 0.9;
    sprite.scale.set(baseW, baseH, 1);
    // updateLabelScales() cần cỡ gốc để nới ra, đừng nới chồng lên lần trước
    sprite.userData.baseScale = { x: baseW, y: baseH };
    sprite.raycast = () => {};
    return sprite;
  }

  /**
   * Giữ nhãn tên block không nhỏ hơn ngưỡng đọc được.
   *
   * Sprite có kích thước cố định theo world nên lùi camera ra xa là nhãn co
   * lại thành vệt xám. Ở đây nới tỉ lệ theo khoảng cách sao cho nhãn luôn cao
   * ít nhất MIN_LABEL_PX điểm ảnh; lại gần thì trả về đúng cỡ thật.
   */
  function updateLabelScales() {
    if (!camera || !scene || !renderer) return;
    const vh = renderer.domElement.clientHeight || 1;
    const halfFovTan = Math.tan(((camera.fov * Math.PI) / 180) / 2);
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Sprite) || obj.name !== 'block_name_label') return;
      if (!obj.visible) return;
      const base = obj.userData.baseScale as { x: number; y: number } | undefined;
      if (!base) return;
      obj.getWorldPosition(labelWorldPos);
      const dist = camera.position.distanceTo(labelWorldPos);
      // Chiều cao thế giới ứng với đúng 1 px màn hình ở khoảng cách này
      const worldPerPx = (2 * halfFovTan * dist) / vh;
      const k = Math.max(1, (MIN_LABEL_PX * worldPerPx) / base.y);
      obj.scale.set(base.x * k, base.y * k, 1);
    });
  }

  /** Dựng mặt phẳng sàn từ nền DXF (SVG) của layout, khớp toạ độ với canvas 2D:
   *  world (x, y) -> 3D (x, z), phủ vùng [0..widthCm] x [0..heightCm]. */
  function buildLayoutBackground() {
    removeLayoutBackground();
    if (!scene || !showBgPlane) return;
    const { widthCm, heightCm } = bgDimsCm;
    if (!bgUrl || widthCm <= 0 || heightCm <= 0) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Vẽ SVG lên canvas theo tỷ lệ layout (giống 2D kéo giãn ảnh vừa widthCm×heightCm)
      const LONG = 2048;
      const aspect = widthCm / heightCm;
      const cw = aspect >= 1 ? LONG : Math.round(LONG * aspect);
      const ch = aspect >= 1 ? Math.round(LONG / aspect) : LONG;
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const cx = canvas.getContext('2d');
      if (!cx) return;
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, cw, ch);
      cx.drawImage(img, 0, 0, cw, ch);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const geo = new THREE.PlaneGeometry(widthCm, heightCm);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: bgT.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits = -1;
      const plane = new THREE.Mesh(geo, mat);
      plane.rotation.x = -Math.PI / 2;
      // Sau khi lật nằm, trục z cục bộ của plane trùng trục Y thế giới, nên
      // rotateZ chính là xoay trong mặt phẳng sàn. Dấu âm vì 2D quay theo chiều
      // kim đồng hồ (trục y hướng xuống) còn three.js quay ngược lại.
      if (bgT.rotationDeg) plane.rotateZ((-bgT.rotationDeg * Math.PI) / 180);
      plane.scale.set(bgT.scale, bgT.scale, 1);
      // Plane tâm ở gốc; layout kéo dài +x, +z từ (0,0) -> dịch tâm về (w/2, h/2)
      plane.position.set(widthCm / 2 + bgT.offsetXCm, 1.0, heightCm / 2 + bgT.offsetYCm);
      plane.renderOrder = -1;
      bgPlane = plane;
      scene.add(plane);
      // Nền nạp bất đồng bộ. Nếu lúc canh khung chưa có nền VÀ mặt bằng chưa
      // đặt gì thì camera đang ở vị trí mặc định — canh lại để thấy cái sân,
      // thay vì nhìn vào khoảng không.
      if (wallGroup.children.length === 0 && currentFloor) autoCenterCamera(currentFloor);
      markSceneDirty();
    };
    img.onerror = () => { /* nền lỗi -> bỏ qua, vẫn hiện furniture */ };
    img.src = bgUrl;
  }

  function buildWalls(floor: Floor) {
    clearGroup(wallGroup);

    // Tường: hình học cố định của mặt bằng, dựng trước block
    for (const w of floor.walls) {
      wallGroup.add(buildWallMesh(w));
    }

    // Furniture
    for (const fi of floor.furniture) {
      const cat = getCatalogItem(fi.catalogId);
      if (!cat) continue;
      // Skip 2D-only architectural symbols
      if (cat.symbol) continue;
      // fi.width/depth/height là kích thước ĐÃ lật; mesh phải dựng theo số gốc
      const orientation = fi.orientation ?? 'bottom';
      const base = unorientDims(
        {
          width: fi.width ?? cat.width,
          depth: fi.depth ?? cat.depth,
          height: fi.height ?? cat.height,
        },
        orientation,
      );
      const furnitureDef = { ...cat, color: fi.color ?? cat.color, ...base };

      const model = createFurnitureModelWithGLB(fi.catalogId, furnitureDef, () => {
        // GLB thay chỗ mesh tạm -> hình khác, phải đặt lại mặt tiếp sàn
        applyOrientation(model, orientation);
        if (renderer && scene && camera) renderer.render(scene, camera);
      });
      applyOrientation(model, orientation);

      // Yaw đặt trên group bọc ngoài để không trộn với phép lật ở trên
      const holder = new THREE.Group();
      holder.add(model);
      holder.rotation.y = -(fi.rotation * Math.PI) / 180;
      holder.position.set(fi.position.x, 1.5 + (fi.elevation ?? 0), fi.position.y);
      // Note: fi.scale is 2D editor scale — don't override 3D model scaling from scaleToFit
      if (fi.scale && (fi.scale.x !== 1 || fi.scale.y !== 1)) {
        holder.scale.x *= fi.scale.x;
        holder.scale.z *= fi.scale.y;
      }
      // Tag for drag-and-drop raycasting
      holder.userData.furnitureId = fi.id;
      holder.traverse((child) => { child.userData.furnitureId = fi.id; });
      const label = createBlockNameLabel(cat.name);
      const box = new THREE.Box3().setFromObject(holder);
      const size = box.getSize(new THREE.Vector3());
      label.position.set(0, size.y + 45, 0);
      holder.add(label);
      wallGroup.add(holder);
    }

  }

  /** Canh khung theo yêu cầu — nút trên thanh công cụ 3D */
  function fitViewToScene() {
    if (!currentFloor) return;
    if (showAllFloors) autoCenterCameraAllFloors(get(currentProject)?.floors.length ?? 1);
    else autoCenterCamera(currentFloor);
    markSceneDirty();
  }

  /** Build all floors stacked vertically in 3D */
  function buildAllFloorsStacked() {
    const project = get(currentProject);
    if (!project || project.floors.length === 0) return;
    const activeF = project.floors.find(f => f.id === project.activeFloorId) ?? project.floors[0];
    buildWalls(activeF);
  }
  
  /** Build a single floor's furniture into a group at a Y offset with optional transparency */
  function buildFloorIntoGroup(_floor: Floor, _group: THREE.Group, _yOffset: number, _opacity: number) {
    // Housing elements removed — nothing to build
  }
  
  function autoCenterCameraAllFloors(floorCount: number) {
    const box = new THREE.Box3().setFromObject(wallGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 400);
    controls.target.copy(center);
    camera.position.set(center.x + maxDim * 1.2, center.y + maxDim * 0.8, center.z + maxDim * 1.2);
    controls.update();
  }
  
  /**
   * Dựng lại cảnh. `forceFit` dành cho thao tác chủ ý của người dùng (đổi chế
   * độ xem, bấm nút canh khung) — còn dựng lại vì dữ liệu đổi thì giữ nguyên
   * góc nhìn, xem quy tắc ở decideCameraFit.
   *
   * Quyết định nằm ở đây chứ không trong buildWalls: chế độ xếp chồng đi qua
   * buildAllFloorsStacked, trước đây nhánh đó tự canh khung vô điều kiện nên
   * bật xếp chồng lên là lỗi zoom quay lại y như cũ.
   */
  function rebuildScene(forceFit = false) {
    const floorCount = get(currentProject)?.floors.length ?? 1;
    if (showAllFloors) {
      buildAllFloorsStacked();
    } else if (currentFloor) {
      buildWalls(currentFloor);
    }

    if (currentFloor) {
      const decision = decideCameraFit(
        cameraFitState,
        currentFloor.id,
        wallGroup.children.length > 0,
      );
      cameraFitState = decision.next;
      if (forceFit || decision.fit) {
        if (showAllFloors) autoCenterCameraAllFloors(floorCount);
        else autoCenterCamera(currentFloor);
        cameraFitState = { ...cameraFitState, floorId: currentFloor.id };
      }
    }
    markSceneDirty();
  }

  function onKeyDown(event: KeyboardEvent) {
    // ESC exits edit mode
    if (event.code === 'Escape' && editMode && !walkthroughMode) {
      if (furniturePlacementMode) {
        furniturePlacementMode = false;
        furniturePickerOpen = false;
        selectedCatalogId = null;
        removeGhostPreview();
        return;
      }
      editMode = false;
      selectedElementId.set(null);
      return;
    }
    if (!walkthroughMode) return;
    
    switch (event.code) {
      // Arrows = move
      case 'ArrowUp': moveForward = true; break;
      case 'ArrowDown': moveBackward = true; break;
      case 'ArrowLeft': moveLeft = true; break;
      case 'ArrowRight': moveRight = true; break;
      // WASD = look
      case 'KeyW': lookUp = true; break;
      case 'KeyS': lookDown = true; break;
      case 'KeyA': lookLeft = true; break;
      case 'KeyD': lookRight = true; break;
      case 'ShiftLeft':
      case 'ShiftRight': isShiftHeld = true; break;
      case 'Escape': exitWalkthroughMode(); break;
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    if (!walkthroughMode) return;
    
    switch (event.code) {
      case 'ArrowUp': moveForward = false; break;
      case 'ArrowDown': moveBackward = false; break;
      case 'ArrowLeft': moveLeft = false; break;
      case 'ArrowRight': moveRight = false; break;
      case 'KeyW': lookUp = false; break;
      case 'KeyS': lookDown = false; break;
      case 'KeyA': lookLeft = false; break;
      case 'KeyD': lookRight = false; break;
      case 'ShiftLeft':
      case 'ShiftRight': isShiftHeld = false; break;
    }
  }
  
  function viewTopDown() {
    // Calculate center of the plan — bao gồm cả nền DXF nếu có
    const box = new THREE.Box3().setFromObject(wallGroup);
    if (bgPlane) box.expandByObject(bgPlane);
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? new THREE.Vector3(500, 0, 500) : box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z, 500);

    // Animate camera to top-down position
    camera.position.set(center.x, maxDim * 1.5, center.z);
    controls.target.set(center.x, 0, center.z);
    controls.update();
    markSceneDirty();
  }

  function toggleWalkthroughMode() {
    if (walkthroughMode) {
      exitWalkthroughMode();
    } else {
      enterWalkthroughMode();
    }
  }
  
  function enterWalkthroughMode() {
    walkthroughMode = true;
    controls.enabled = false;

    // Start at center of scene objects (or origin if empty)
    const box = new THREE.Box3().setFromObject(wallGroup);
    const startX = box.isEmpty() ? 0 : box.getCenter(new THREE.Vector3()).x;
    const startZ = box.isEmpty() ? 0 : box.getCenter(new THREE.Vector3()).z;
    camera.position.set(startX, eyeHeight, startZ);
    camera.lookAt(startX, eyeHeight, startZ - 100);
    pointerControls.lock();
  }
  
  function exitWalkthroughMode() {
    walkthroughMode = false;
    controls.enabled = true;
    velocity.set(0, 0, 0);
    moveForward = moveBackward = moveLeft = moveRight = false;
    lookLeft = lookRight = lookUp = lookDown = false;
    
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    
    if (walkthroughMode) {
      const delta = 0.016; // Approximate 60fps
      const speed = isShiftHeld ? sprintSpeed : moveSpeed;
      
      velocity.x -= velocity.x * 10.0 * delta;
      velocity.z -= velocity.z * 10.0 * delta;
      
      direction.z = Number(moveForward) - Number(moveBackward);
      direction.x = Number(moveRight) - Number(moveLeft);
      direction.normalize();
      
      if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
      if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;
      
      pointerControls.moveRight(-velocity.x * delta);
      pointerControls.moveForward(-velocity.z * delta);
      camera.position.y = eyeHeight;

      if (lookLeft || lookRight) {
        const yaw = ((lookLeft ? 1 : 0) - (lookRight ? 1 : 0)) * LOOK_SPEED * delta;
        camera.rotation.y += yaw;
      }
      if (lookUp || lookDown) {
        const pitch = ((lookUp ? 1 : 0) - (lookDown ? 1 : 0)) * LOOK_SPEED * delta;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x + pitch));
      }
      // Always render in walkthrough mode (camera constantly moving)
      updateLabelScales();
      renderer.render(scene, camera);
    } else {
      // controls.update() may fire 'change' event (which sets sceneDirty)
      controls.update();
      if (sceneDirty) {
        sceneDirty = false;
        updateLabelScales();
        renderer.render(scene, camera);
      }
    }
  }

  function onResize() {
    if (!container || !renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    markSceneDirty();
  }

  function takeScreenshot() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'floorplan-3d.png';
    link.href = dataUrl;
    link.click();
  }

  onMount(() => {
    init();
    animate();

    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(container);

    const unsub = activeFloor.subscribe((f) => {
      currentFloor = f;
      if (f) rebuildScene();
    });

    // Nền DXF của layout -> mặt phẳng sàn 3D (hiển thị khi xem top-view)
    const unsubBg = layoutBgFile.subscribe((url) => {
      bgUrl = url;
      if (scene) buildLayoutBackground();
    });
    const unsubBgT = layoutBgTransform.subscribe((t) => {
      bgT = t;
      if (scene) buildLayoutBackground();
    });
    const unsubDims = layoutDimsCm.subscribe((d) => {
      bgDimsCm = d;
      if (scene) buildLayoutBackground();
    });

    return () => {
      resizeObs.disconnect();
      unsub();
      unsubBg();
      unsubBgT();
      unsubDims();
      removeLayoutBackground();
      cancelAnimationFrame(animId);
      document.removeEventListener('keydown', onKeyDown, false);
      document.removeEventListener('keyup', onKeyUp, false);
      renderer.dispose();
    };
  });
</script>

<div bind:this={container} class="w-full h-full relative">
  <!-- 3D Toolbar Row -->
  <div class="absolute top-4 right-4 z-50 flex gap-1.5 transition-[right] duration-150 {panelInset}">
    <!-- Multi-Floor Stacking Toggle -->
    <button
      onclick={() => { showAllFloors = !showAllFloors; rebuildScene(true); }}
      class="p-2 rounded-lg transition-colors {showAllFloors ? 'bg-purple-600 text-white ring-2 ring-purple-300' : 'bg-black/70 text-white hover:bg-black/80'}"
      title={showAllFloors ? 'Active Floor Only' : 'Show All Floors Stacked'}
      aria-label={showAllFloors ? 'Active Floor Only' : 'Show All Floors Stacked'}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="4" y="14" width="16" height="4" rx="1"/>
        <rect x="4" y="8" width="16" height="4" rx="1" opacity="0.6"/>
        <rect x="4" y="2" width="16" height="4" rx="1" opacity="0.3"/>
      </svg>
    </button>

    <!-- Fit View Button -->
    <button
      onclick={fitViewToScene}
      class="p-2 rounded-lg bg-black/70 text-white hover:bg-black/80 transition-colors"
      title="Canh khung vừa mặt bằng"
      aria-label="Canh khung vừa mặt bằng"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 8V5a2 2 0 0 1 2-2h3"/>
        <path d="M16 3h3a2 2 0 0 1 2 2v3"/>
        <path d="M21 16v3a2 2 0 0 1-2 2h-3"/>
        <path d="M8 21H5a2 2 0 0 1-2-2v-3"/>
      </svg>
    </button>

    <!-- Top-Down View Button -->
    <button
      onclick={viewTopDown}
      class="p-2 rounded-lg bg-black/70 text-white hover:bg-black/80 transition-colors"
      title="Top-Down View"
      aria-label="Top-Down View"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="2" x2="12" y2="6"/>
        <line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="6" y2="12"/>
        <line x1="18" y1="12" x2="22" y2="12"/>
      </svg>
    </button>

    <!-- DXF Background Toggle (chỉ khi layout có nền DXF) -->
    {#if bgUrl}
      <button
        onclick={() => { showBgPlane = !showBgPlane; buildLayoutBackground(); }}
        class="p-2 rounded-lg transition-colors {showBgPlane ? 'bg-emerald-600 text-white ring-2 ring-emerald-300' : 'bg-black/70 text-white hover:bg-black/80'}"
        title={showBgPlane ? 'Ẩn nền DXF' : 'Hiện nền DXF'}
        aria-label="Bật/tắt nền DXF"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 3v18" opacity="0.6"/>
        </svg>
      </button>
    {/if}

    <!-- Block Name Labels Toggle -->
    <button
      onclick={() => { showBlockLabels = !showBlockLabels; applyBlockLabelVisibility(); }}
      class="p-2 rounded-lg transition-colors {showBlockLabels ? 'bg-indigo-600 text-white ring-2 ring-indigo-300' : 'bg-black/70 text-white hover:bg-black/80'}"
      title={showBlockLabels ? 'Ẩn tên block' : 'Hiện tên block'}
      aria-label="Bật/tắt tên block"
      aria-pressed={showBlockLabels}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
    </button>

    <!-- Edit Mode Toggle -->
    <button
      onclick={() => { editMode = !editMode; if (editMode && walkthroughMode) { exitWalkthroughMode(); } if (!editMode) { selectedElementId.set(null); } }}
      class="p-2 rounded-lg transition-colors {editMode ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-black/70 text-white hover:bg-black/80'}"
      title={editMode ? 'Exit Edit Mode' : 'Edit Mode — click to select walls & change materials'}
      aria-label={editMode ? 'Exit Edit Mode' : 'Edit Mode'}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>

    <!-- Interior Camera Button -->
    <button
      onclick={() => {
        if (cameraPlacementMode) {
          cameraPlacementMode = false;
        } else {
          cameraPlacementMode = true;
          cameraPlaced = false;
          editMode = true;
          if (walkthroughMode) exitWalkthroughMode();
          furniturePlacementMode = false;
        }
      }}
      class="p-2 rounded-lg transition-colors {cameraPlacementMode ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-black/70 text-white hover:bg-black/80'}"
      title={cameraPlacementMode ? 'Cancel camera placement (click floor to place)' : 'Place Interior Camera — click floor to position, click again to aim'}
      aria-label="Place Interior Camera"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 7l-7 5 7 5V7z"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    </button>

    <!-- 3D Screenshot Button -->
    <button
      onclick={takeScreenshot}
      class="p-2 rounded-lg bg-black/70 text-white hover:bg-black/80 transition-colors"
      title="Save 3D Screenshot"
      aria-label="Save 3D Screenshot"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
    </button>

    <!-- Walkthrough Mode Toggle Button -->
    <button
      onclick={toggleWalkthroughMode}
      class="p-2 rounded-lg bg-black/70 text-white hover:bg-black/80 transition-colors"
      title={walkthroughMode ? 'Exit Walkthrough Mode' : 'Enter Walkthrough Mode'}
      aria-label={walkthroughMode ? 'Exit Walkthrough Mode' : 'Enter Walkthrough Mode'}
  >
    {#if walkthroughMode}
      <!-- Exit/Eye closed icon -->
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    {:else}
      <!-- Walking person icon -->
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="4" r="2"/>
        <path d="M10 16v6"/>
        <path d="M14 16v6"/>
        <path d="M12 6h2l4 4"/>
        <path d="M10 14l2-2 1 2"/>
      </svg>
    {/if}
    </button>
  </div><!-- end 3D toolbar row -->

  {#if quantityLimitMsg}
    <div class="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded-lg text-sm shadow backdrop-blur-sm">
      {quantityLimitMsg}
    </div>
  {/if}

  {#if cameraPlacementMode && !cameraPlaced}
    <div class="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white px-4 py-2 rounded-lg text-sm backdrop-blur-sm">
      📷 Click on the floor to place camera position
    </div>
  {:else if cameraPlacementMode && cameraPlaced}
    <div class="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white px-4 py-2 rounded-lg text-sm backdrop-blur-sm">
      🎯 Click where the camera should look
    </div>
  {/if}

  <!-- Camera Preview Panel -->
  {#if cameraPreviewOpen && cameraPlaced}
    <div class="absolute bottom-4 right-4 z-50 bg-gray-900/95 rounded-xl shadow-2xl backdrop-blur-sm overflow-y-auto max-w-[calc(100vw-2rem)] {panelInset}" style="width: 420px; max-height: calc(100vh - 8rem);">
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span class="text-white text-sm font-medium">📷 Interior Camera</span>
        <div class="flex gap-2">
          <button class="text-xs text-blue-400 hover:text-blue-300" onclick={() => { aiRenderOpen = !aiRenderOpen; }}>
            {aiRenderOpen ? 'Hide AI' : '✨ AI Render'}
          </button>
          <button class="text-gray-400 hover:text-white text-lg leading-none" onclick={() => { cameraPreviewOpen = false; if (cameraHelper) { wallGroup.remove(cameraHelper); cameraHelper = null; } cameraPlaced = false; aiRenderOpen = false; aiRenderResult = null; aiRenderError = null; }} aria-label="Close camera">✕</button>
        </div>
      </div>
      <!-- Preview canvas with drag-to-rotate -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative cursor-grab active:cursor-grabbing"
        onpointerdown={(e) => { previewDragStart = { x: e.clientX, y: e.clientY, yaw: cameraYaw, pitch: cameraPitch }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onpointermove={(e) => { if (!previewDragStart) return; const dx = e.clientX - previewDragStart.x; const dy = e.clientY - previewDragStart.y; cameraYaw = previewDragStart.yaw + dx * 0.5; cameraPitch = Math.max(-45, Math.min(45, previewDragStart.pitch - dy * 0.3)); cameraPreviewDirty = true; }}
        onpointerup={() => { previewDragStart = null; }}
      >
        <canvas bind:this={cameraPreviewCanvas} width="384" height="216" class="w-full pointer-events-none"></canvas>
        <div class="absolute bottom-1 left-1 text-[10px] text-white/50 pointer-events-none">Drag to look around</div>
      </div>

      <!-- Movement arrows -->
      <div class="flex items-center justify-center gap-1 py-1.5 border-b border-gray-800">
        <span class="text-[10px] text-gray-500 mr-2">Move:</span>
        <button class="w-7 h-7 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs flex items-center justify-center" onclick={() => moveCameraRelative(0, -10)} title="Move left">←</button>
        <div class="flex flex-col gap-0.5">
          <button class="w-7 h-7 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs flex items-center justify-center" onclick={() => moveCameraRelative(10, 0)} title="Move forward">↑</button>
          <button class="w-7 h-7 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs flex items-center justify-center" onclick={() => moveCameraRelative(-10, 0)} title="Move backward">↓</button>
        </div>
        <button class="w-7 h-7 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs flex items-center justify-center" onclick={() => moveCameraRelative(0, 10)} title="Move right">→</button>
      </div>

      <div class="px-3 py-2 space-y-1.5">
        <label class="flex items-center justify-between text-xs text-gray-300">
          <span>FOV</span>
          <div class="flex items-center gap-2">
            <input type="range" min="50" max="120" bind:value={cameraFOV} class="w-28 h-1 accent-blue-400"
              oninput={() => { cameraPreviewDirty = true; }} />
            <span class="w-10 text-right">{cameraFOV}°</span>
          </div>
        </label>
        <label class="flex items-center justify-between text-xs text-gray-300">
          <span>Height</span>
          <div class="flex items-center gap-2">
            <input type="range" min="80" max="220" bind:value={cameraHeight} class="w-28 h-1 accent-blue-400"
              oninput={() => { cameraPreviewDirty = true; }} />
            <span class="w-10 text-right">{cameraHeight}cm</span>
          </div>
        </label>
        <label class="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
          <input type="checkbox" bind:checked={cameraXrayWalls} class="accent-blue-400" onchange={() => { cameraPreviewDirty = true; }} />
          <span>X-ray walls (see through)</span>
        </label>
        <div class="flex gap-2 pt-1">
          <button
            class="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
            onclick={captureInteriorPhoto}
          >
            📸 Capture 1920×1080
          </button>
          <button
            class="px-3 py-1.5 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 transition-colors"
            onclick={() => { cameraPlacementMode = true; cameraPlaced = false; }}
          >
            Reposition
          </button>
        </div>
      </div>

      <!-- AI Render Section -->
      {#if aiRenderOpen}
        <div class="border-t border-gray-700 px-3 py-3 space-y-2">
          <div class="text-xs font-medium text-white">✨ AI Photorealistic Render</div>

          <!-- Provider toggle -->
          <div class="flex rounded-lg overflow-hidden border border-gray-700">
            <button
              class="flex-1 text-xs py-1.5 font-medium transition-colors {aiProvider === 'gemini' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}"
              onclick={() => { aiProvider = 'gemini'; }}
            >Gemini</button>
            <button
              class="flex-1 text-xs py-1.5 font-medium transition-colors {aiProvider === 'openai' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}"
              onclick={() => { aiProvider = 'openai'; }}
            >OpenAI</button>
          </div>

          <label class="block">
            <span class="text-[10px] text-gray-400 block mb-1">Model</span>
            {#if aiProvider === 'gemini'}
              <select bind:value={aiModel} class="w-full bg-gray-800 text-gray-200 text-xs rounded px-1.5 py-1.5 border border-gray-700">
                {#each AI_MODELS as m}<option value={m.id}>{m.name} — {m.desc}</option>{/each}
              </select>
            {:else}
              <select bind:value={openaiModel} class="w-full bg-gray-800 text-gray-200 text-xs rounded px-1.5 py-1.5 border border-gray-700">
                {#each OPENAI_MODELS as m}<option value={m.id}>{m.name} — {m.desc}</option>{/each}
              </select>
            {/if}
          </label>
          
          <div class="grid grid-cols-3 gap-2">
            <label class="block">
              <span class="text-[10px] text-gray-400 block mb-1">Style</span>
              <select bind:value={aiRenderStyle} class="w-full bg-gray-800 text-gray-200 text-xs rounded px-1.5 py-1 border border-gray-700">
                {#each STYLE_OPTIONS as opt}<option value={opt}>{opt}</option>{/each}
              </select>
            </label>
            <label class="block">
              <span class="text-[10px] text-gray-400 block mb-1">Lighting</span>
              <select bind:value={aiRenderLighting} class="w-full bg-gray-800 text-gray-200 text-xs rounded px-1.5 py-1 border border-gray-700">
                {#each LIGHTING_OPTIONS as opt}<option value={opt}>{opt}</option>{/each}
              </select>
            </label>
            <label class="block">
              <span class="text-[10px] text-gray-400 block mb-1">Mood</span>
              <select bind:value={aiRenderMood} class="w-full bg-gray-800 text-gray-200 text-xs rounded px-1.5 py-1 border border-gray-700">
                {#each MOOD_OPTIONS as opt}<option value={opt}>{opt}</option>{/each}
              </select>
            </label>
          </div>

          <label class="block">
            <span class="text-[10px] text-gray-400 block mb-1">Extra instructions (optional)</span>
            <input type="text" bind:value={aiRenderExtra} placeholder="e.g. hardwood floors, white marble counters..."
              class="w-full bg-gray-800 text-gray-200 text-xs rounded px-2 py-1.5 border border-gray-700 placeholder:text-gray-600" />
          </label>

          <details class="text-[10px] text-gray-500">
            <summary class="cursor-pointer hover:text-gray-400">View full prompt</summary>
            <p class="mt-1 p-2 bg-gray-800 rounded text-gray-400 leading-relaxed">{buildAIPrompt()}</p>
          </details>

          <button
            class="w-full px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            onclick={runAIRender}
            disabled={aiRendering}
          >
            {#if aiRendering}
              <span class="animate-spin">⏳</span> Rendering...
            {:else}
              ✨ Generate Photorealistic Render
            {/if}
          </button>

          {#if aiRenderError}
            <div class="bg-red-900/30 border border-red-700 rounded-lg p-3 space-y-2">
              <div class="text-xs font-medium text-red-400">❌ AI Render Failed</div>
              <pre class="text-[10px] text-red-300 whitespace-pre-wrap break-all max-h-32 overflow-y-auto select-all cursor-text font-mono bg-red-950/40 rounded p-2">{aiRenderError}</pre>
              <button
                class="text-[10px] text-red-400 hover:text-red-300 underline"
                onclick={() => { navigator.clipboard.writeText(aiRenderError ?? ''); }}
              >📋 Copy error</button>
            </div>
          {/if}

          {#if aiRenderResult}
            <div class="space-y-2">
              <img src={aiRenderResult} alt="AI Render" class="w-full rounded-lg" />
              <button
                class="w-full px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-500 transition-colors"
                onclick={downloadAIRender}
              >
                💾 Download Render
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if walkthroughMode}
    <!-- Crosshair -->
    <div class="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
      <div class="w-4 h-4">
        <svg width="16" height="16" viewBox="0 0 16 16" class="text-white drop-shadow-lg">
          <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="1"/>
          <line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" stroke-width="1"/>
          <line x1="2" y1="8" x2="6" y2="8" stroke="currentColor" stroke-width="1"/>
          <line x1="10" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1"/>
        </svg>
      </div>
    </div>
    
    <!-- Controls Panel -->
    <div class="absolute top-4 left-4 z-10 bg-black/70 text-white text-xs rounded-lg backdrop-blur-sm p-3 space-y-2 min-w-[180px]">
      <div class="font-semibold text-white/90 mb-1">Walkthrough Controls</div>
      <label class="flex items-center justify-between gap-2">
        <span class="text-white/70">Eye Height</span>
        <div class="flex items-center gap-1">
          <input type="range" min="80" max="220" bind:value={eyeHeight} class="w-16 h-1 accent-blue-400" />
          <span class="w-10 text-right">{eyeHeight}cm</span>
        </div>
      </label>
      <label class="flex items-center justify-between gap-2">
        <span class="text-white/70">Walk Speed</span>
        <div class="flex items-center gap-1">
          <input type="range" min="100" max="1000" step="50" bind:value={moveSpeed} class="w-16 h-1 accent-blue-400" />
          <span class="w-10 text-right">{moveSpeed}</span>
        </div>
      </label>
      <label class="flex items-center justify-between gap-2">
        <span class="text-white/70">Sprint Speed</span>
        <div class="flex items-center gap-1">
          <input type="range" min="200" max="2000" step="100" bind:value={sprintSpeed} class="w-16 h-1 accent-blue-400" />
          <span class="w-10 text-right">{sprintSpeed}</span>
        </div>
      </label>
    </div>

    <!-- Help Text -->
    <div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
      <div class="bg-black/70 text-white text-sm px-4 py-2 rounded-lg backdrop-blur-sm">
        WASD to look • Arrows to move • Mouse to look • Shift to sprint • ESC to exit
      </div>
    </div>
  {/if}

  {#if editMode && !walkthroughMode}
    <div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
      <div class="bg-blue-600/90 text-white text-sm px-4 py-2 rounded-lg backdrop-blur-sm flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        🪑 Click floor to place {selectedCatalogId ? getCatalogItem(selectedCatalogId)?.name ?? 'furniture' : 'furniture'} • ESC to cancel
      </div>
    </div>

    <!-- Furniture Placement Toggle -->
    <button
      onclick={() => { furniturePlacementMode = !furniturePlacementMode; if (!furniturePlacementMode) { removeGhostPreview(); selectedCatalogId = null; furniturePickerOpen = false; } else { furniturePickerOpen = true; } }}
      class="absolute top-16 right-28 z-50 p-2 rounded-lg transition-colors {$propertiesPanelOpen ? 'md:right-[27rem]' : ''} {furniturePlacementMode ? 'bg-green-600 text-white ring-2 ring-green-300' : 'bg-black/70 text-white hover:bg-black/80'}"
      title={furniturePlacementMode ? 'Exit Furniture Placement' : 'Place Furniture'}
      aria-label={furniturePlacementMode ? 'Exit Furniture Placement' : 'Place Furniture'}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="12" width="18" height="8" rx="1"/>
        <path d="M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/>
        <line x1="5" y1="20" x2="5" y2="22"/>
        <line x1="19" y1="20" x2="19" y2="22"/>
      </svg>
    </button>

    <!-- Furniture Picker Panel -->
    {#if furniturePlacementMode && furniturePickerOpen}
      <div class="absolute top-4 left-4 z-50 bg-black/85 text-white rounded-lg backdrop-blur-sm w-56 max-h-[70vh] flex flex-col overflow-hidden select-none">
        <div class="p-2 border-b border-white/10 flex items-center justify-between">
          <span class="font-semibold text-sm">🪑 Furniture</span>
          <button onclick={() => { furniturePickerOpen = false; }} class="text-white/50 hover:text-white text-lg leading-none">&times;</button>
        </div>
        <!-- Category tabs -->
        <div class="flex flex-wrap gap-1 p-2 border-b border-white/10">
          {#each furnitureCategories.filter(c => c !== 'Electrical' && c !== 'Plumbing') as cat}
            <button
              onclick={() => { furniturePickerCategory = cat; }}
              class="px-2 py-0.5 rounded text-[10px] transition-colors {furniturePickerCategory === cat ? 'bg-green-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white/70'}"
            >{cat}</button>
          {/each}
        </div>
        <!-- Items -->
        <div class="overflow-y-auto p-1 flex-1">
          {#each furnitureCatalog.filter(f => f.category === furniturePickerCategory && !f.symbol) as item}
            <button
              onclick={() => { selectedCatalogId = item.id; removeGhostPreview(); }}
              class="w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors {selectedCatalogId === item.id ? 'bg-green-600/80 text-white' : 'hover:bg-white/10 text-white/80'}"
            >
              <span class="text-base">{item.icon}</span>
              <span>{item.name}</span>
              <span class="ml-auto text-[10px] text-white/40">{item.width}×{item.depth}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}

  <!-- MaterialPicker removed — wall materials editable via Properties panel -->

  <!-- Lighting Controls Toggle Button -->
  <button
    onclick={() => { lightingPanelOpen = !lightingPanelOpen; }}
    class="absolute bottom-4 left-4 z-50 p-2 rounded-lg transition-colors {lightingPanelOpen ? 'bg-amber-500 text-white ring-2 ring-amber-300' : 'bg-black/70 text-white hover:bg-black/80'}"
    title="Lighting Controls"
    aria-label="Lighting Controls"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  </button>

  <!-- Lighting Controls Panel -->
  {#if lightingPanelOpen}
    <div class="absolute bottom-14 left-4 z-50 bg-black/80 text-white text-xs rounded-lg backdrop-blur-sm p-3 space-y-3 min-w-[220px] select-none">
      <div class="font-semibold text-white/90 text-sm flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/></svg>
        Lighting Controls
      </div>

      <!-- Time of Day Presets -->
      <div class="space-y-1">
        <span class="text-white/60 text-[10px] uppercase tracking-wide">Time of Day</span>
        <div class="flex gap-1">
          {#each (['morning', 'noon', 'evening', 'night'] as const) as preset}
            <button
              onclick={() => applyTimePreset(preset)}
              class="flex-1 px-1.5 py-1 rounded text-[11px] transition-colors {timeOfDay === preset ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}"
            >
              {preset === 'morning' ? '🌅' : preset === 'noon' ? '☀️' : preset === 'evening' ? '🌇' : '🌙'}
              <span class="block capitalize">{preset}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Sun Position -->
      <label class="block space-y-0.5">
        <div class="flex justify-between text-white/60">
          <span>Sun Position</span><span>{sunAzimuth}°</span>
        </div>
        <input type="range" min="0" max="360" bind:value={sunAzimuth} oninput={() => { timeOfDay = null; updateSunPosition(); }} class="w-full h-1 accent-amber-400" />
      </label>

      <!-- Sun Elevation -->
      <label class="block space-y-0.5">
        <div class="flex justify-between text-white/60">
          <span>Sun Elevation</span><span>{sunElevation}°</span>
        </div>
        <input type="range" min="0" max="90" bind:value={sunElevation} oninput={() => { timeOfDay = null; updateSunPosition(); }} class="w-full h-1 accent-amber-400" />
      </label>

      <!-- Ambient Intensity -->
      <label class="block space-y-0.5">
        <div class="flex justify-between text-white/60">
          <span>Ambient Light</span><span>{Math.round(ambientIntensity * 100)}%</span>
        </div>
        <input type="range" min="0" max="100" value={Math.round(ambientIntensity * 100)} oninput={(e) => { ambientIntensity = parseInt(e.currentTarget.value) / 100; timeOfDay = null; updateAmbientIntensity(); }} class="w-full h-1 accent-blue-400" />
      </label>
    </div>
  {/if}
</div>
