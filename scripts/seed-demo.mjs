/**
 * Seed demo project using the test files in file_test/
 * Run: node scripts/seed-demo.mjs
 *
 * What it creates:
 *   - Project "Demo VHE1"
 *   - 3 Products (ST4-7+8, DC 1.1, HDA01) with IFC/STEP assets
 *   - Layout "VHE1 - Hall 10-9" with DXF background
 *   - 1 snapshot placing 3 products on the layout
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_TEST = path.join(__dirname, '..', 'file_test');
const BASE = 'http://localhost:4000/api';

// ── HTTP helpers ──────────────────────────────────────────────────────────────
let cookieHeader = '';

async function api(method, pathname, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  const res = await fetch(BASE + pathname, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    // accumulate cookies
    const parts = setCookie.split(',').map(c => c.split(';')[0].trim());
    cookieHeader = parts.join('; ');
  }
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text }; }
}

async function uploadFile(pathname, filePath, extraFields = {}) {
  const form = new FormData();
  const fileBytes = fs.readFileSync(filePath);
  const blob = new Blob([fileBytes]);
  form.append('file', blob, path.basename(filePath));
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);

  const headers = {};
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  const res = await fetch(BASE + pathname, { method: 'POST', headers, body: form });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const parts = setCookie.split(',').map(c => c.split(';')[0].trim());
    cookieHeader = parts.join('; ');
  }
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text }; }
}

async function pollAsset(assetId, maxWaitMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { body } = await api('GET', `/assets/${assetId}`);
    process.stdout.write(`\r   Converting... [${body.status}] ${Math.round((Date.now()-start)/1000)}s   `);
    if (body.status === 'ready') { process.stdout.write('\n'); return body; }
    if (body.status === 'failed') { process.stdout.write('\n'); throw new Error(`Asset failed: ${body.error}`); }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('Asset conversion timed out');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Demo VHE1 Seed Script ===\n');

  // 1. Login
  process.stdout.write('1. Login... ');
  const { body: user, status: loginStatus } = await api('POST', '/auth/login', {
    email: 'admin@floor-manager.local',
    password: 'Admin2026!',
  });
  if (!user.id) throw new Error(`Login failed (${loginStatus}): ${JSON.stringify(user)}`);
  console.log(`OK (${user.email})`);

  // 2. Clean up existing "Demo VHE1" project if any
  const { body: projects } = await api('GET', '/projects');
  const existing = Array.isArray(projects) && projects.find(p => p.name === 'Demo VHE1');
  if (existing) {
    process.stdout.write(`2. Removing existing demo project ${existing.id}... `);
    await api('DELETE', `/projects/${existing.id}`);
    console.log('OK');
  }

  // Clean up existing "VHE1 - Hall 10-9" layout if any
  const { body: layouts0 } = await api('GET', '/layouts');
  const existingLayout = Array.isArray(layouts0) && layouts0.find(l => l.name === 'VHE1 - Hall 10-9');
  if (existingLayout) {
    process.stdout.write(`   Removing existing layout ${existingLayout.id}... `);
    await api('DELETE', `/layouts/${existingLayout.id}`);
    console.log('OK');
  }

  // 3. Create project
  process.stdout.write('3. Create project "Demo VHE1"... ');
  const { body: project } = await api('POST', '/projects', {
    name: 'Demo VHE1',
    description: 'Demo: IFC/STEP → asset pipeline, DXF → layout background',
  });
  if (!project.id) throw new Error('Create project failed: ' + JSON.stringify(project));
  console.log(`OK: ${project.id}`);

  // 4. Create products + upload assets
  // IFC: web-ifc outputs meters → unitScale=1
  // STEP: occt outputs native file units (usually mm) → unitScale=0.001 (mm→m)
  const cadFiles = [
    { file: '10020-07-ST4-7+8.ifc',  code: '10020-07-ST4', name: 'ST4-7+8 (Dầm thép tổ hợp)',  unitScale: '1' },
    { file: '10022-01-DC 1.1.stp',   code: '10022-01-DC',  name: 'DC 1.1 (Cột thép đặc)',       unitScale: '0.001' },
    { file: '10022-11-HDA01.ifc',    code: '10022-11-HDA', name: 'HDA01 (Kết cấu thép HDA)',    unitScale: '1' },
  ];

  const createdProducts = [];
  for (const cad of cadFiles) {
    console.log(`\n4. Product: ${cad.code}`);

    // Create product
    process.stdout.write(`   Creating product... `);
    const { body: prod } = await api('POST', '/products', {
      projectId: project.id,
      name: cad.name,
      code: cad.code,
      category: 'STEEL_STRUCTURE',
      color: '#1e40af',
    });
    if (!prod.id) throw new Error('Create product failed: ' + JSON.stringify(prod));
    console.log(`OK: ${prod.id}`);

    const filePath = path.join(FILE_TEST, cad.file);
    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠ File not found: ${filePath}`);
      createdProducts.push({ ...prod, assetId: null });
      continue;
    }

    const sizeKB = Math.round(fs.statSync(filePath).size / 1024);
    process.stdout.write(`   Uploading ${cad.file} (${sizeKB}KB)... `);
    const { body: asset } = await uploadFile('/assets', filePath, {
      productId: prod.id,
      unitScale: cad.unitScale,
    });
    if (!asset.id) throw new Error('Upload asset failed: ' + JSON.stringify(asset));
    console.log(`Queued: ${asset.id}`);

    process.stdout.write('   Converting');
    try {
      const readyAsset = await pollAsset(asset.id);
      console.log(`   ✓ bbox: ${readyAsset.bboxLengthM?.toFixed(2)}m L × ${readyAsset.bboxWidthM?.toFixed(2)}m W × ${readyAsset.bboxHeightM?.toFixed(2)}m H`);
      createdProducts.push({ ...prod, assetId: asset.id });
    } catch (e) {
      console.log(`   ✗ ${e.message}`);
      createdProducts.push({ ...prod, assetId: null });
    }
  }

  // 5. Create layout + upload DXF background
  console.log('\n5. Layout "VHE1 - Hall 10-9"');
  process.stdout.write('   Creating layout... ');
  const { body: layout } = await api('POST', '/layouts', {
    siteId: 'site-default',
    name: 'VHE1 - Hall 10-9',
    widthM: 190.8412,
    heightM: 105.1294,
    gridSize: 1,
  });
  if (!layout.id) throw new Error('Create layout failed: ' + JSON.stringify(layout));
  console.log(`OK: ${layout.id}`);

  const dxfPath = path.join(FILE_TEST, 'LAYOUT VHE1 10-9.dxf');
  const dxfSizeKB = Math.round(fs.statSync(dxfPath).size / 1024);
  process.stdout.write(`   Uploading DXF (${dxfSizeKB}KB)... `);
  const { body: layoutUpdated, status: bgStatus } = await uploadFile(`/layouts/${layout.id}/background`, dxfPath);
  if (bgStatus !== 200) throw new Error(`Upload background failed (${bgStatus}): ${JSON.stringify(layoutUpdated)}`);
  console.log(`OK → ${layoutUpdated.widthM.toFixed(1)}m × ${layoutUpdated.heightM.toFixed(1)}m`);

  // 6. Create snapshot with products placed on layout
  // x,y in METERS (backend convention) — mapping.ts multiplies by 100 to get cm for editor
  console.log('\n6. Creating snapshot...');
  const positions = createdProducts.map((p, i) => ({
    productId: p.id,
    x: 20 + i * 50,   // 20m, 70m, 120m from left edge (layout is 190m wide)
    y: 30,             // 30m from top (layout is 105m tall)
    rotation: 0,
    scale: 1,
    orientation: 'bottom',
  }));
  const today = new Date().toISOString().split('T')[0];
  const { body: snapshot } = await api('POST', '/snapshots', {
    layoutId: layout.id,
    date: today,
    note: 'Demo snapshot tự động từ seed-demo.mjs',
    positions,
  });
  if (!snapshot.id) throw new Error('Create snapshot failed: ' + JSON.stringify(snapshot));
  console.log(`OK: ${snapshot.id} (${snapshot.date})`);

  // ── Summary ──
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║              SEED COMPLETE                        ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║ Project  : ${project.name.padEnd(38)}║`);
  console.log('║ Products :                                        ║');
  for (const p of createdProducts) {
    const assetStatus = p.assetId ? '✓ asset' : '✗ no asset';
    console.log(`║   ${p.code.padEnd(20)} ${assetStatus.padEnd(26)}║`);
  }
  console.log(`║ Layout   : ${layout.name.padEnd(38)}║`);
  console.log(`║ Snapshot : ${snapshot.date.padEnd(38)}║`);
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log('║ Open: http://localhost:5173                       ║');
  console.log('╚═══════════════════════════════════════════════════╝');
}

main().catch(e => {
  console.error('\n✗ ERROR:', e.message);
  process.exit(1);
});
