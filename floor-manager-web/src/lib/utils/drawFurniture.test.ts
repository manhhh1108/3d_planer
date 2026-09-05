import { describe, it, expect, beforeEach } from 'vitest';
import { drawFurnitureItem } from './canvasRenderer';
import { blockColor } from './blockColor';
import { setFurnitureCatalog, type FurnitureDef } from './furnitureCatalog';
import type { FurnitureItem } from '$lib/models/types';

/** ctx giả: ghi lại mọi lệnh vẽ và mọi lần gán style để kiểm tra. */
function fakeCtx() {
  const calls: Array<[string, ...unknown[]]> = [];
  const styles: Array<[string, unknown]> = [];
  const rec = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); };
  const target: Record<string, unknown> = {
    save: rec('save'), restore: rec('restore'), translate: rec('translate'),
    rotate: rec('rotate'), scale: rec('scale'), beginPath: rec('beginPath'),
    closePath: rec('closePath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    arc: rec('arc'), fill: rec('fill'), stroke: rec('stroke'),
    fillRect: rec('fillRect'), strokeRect: rec('strokeRect'), rect: rec('rect'),
    fillText: rec('fillText'), strokeText: rec('strokeText'), clip: rec('clip'),
    setLineDash: rec('setLineDash'), measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    roundRect: rec('roundRect'), ellipse: rec('ellipse'), quadraticCurveTo: rec('quadraticCurveTo'),
    bezierCurveTo: rec('bezierCurveTo'), arcTo: rec('arcTo'), drawImage: rec('drawImage'),
  };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k as string] : undefined),
    set: (t, k, v) => { styles.push([k as string, v]); t[k as string] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, styles };
}

const cs = (ctx: CanvasRenderingContext2D) =>
  ({ ctx, zoom: 1, camX: 0, camY: 0, width: 800, height: 600 }) as any;

const L_RING: [number, number][] = [
  [-200, -200], [200, -200], [200, 0], [0, 0], [0, 200], [-200, 200],
];
const base: FurnitureDef = {
  id: 'box', name: 'Box', category: 'Sản phẩm', icon: '📦',
  color: '#111111', width: 400, depth: 400, height: 100,
};
const ell: FurnitureDef = { ...base, id: 'ell', footprint: [L_RING] };

const item = (over: Partial<FurnitureItem> & { catalogId: string }) =>
  ({ id: 'i1', position: { x: 0, y: 0 }, rotation: 0, ...over }) as FurnitureItem;

beforeEach(() => setFurnitureCatalog([base, ell]));

describe('blockColor', () => {
  const stageOf = (id: string | undefined) => (id === 'st-son' ? '#10b981' : undefined);

  it('công đoạn thắng màu riêng và màu danh mục', () => {
    expect(blockColor({ stageId: 'st-son', color: '#abcdef' }, '#111111', stageOf)).toBe('#10b981');
  });
  it('chưa gán công đoạn -> màu riêng của block', () => {
    expect(blockColor({ stageId: undefined, color: '#abcdef' }, '#111111', stageOf)).toBe('#abcdef');
  });
  it('không có gì -> màu danh mục', () => {
    expect(blockColor({ stageId: undefined, color: undefined }, '#111111', stageOf)).toBe('#111111');
  });
  it('stageId trỏ tới công đoạn đã xoá -> không lấy màu rác', () => {
    expect(blockColor({ stageId: 'da-xoa', color: '#abcdef' }, '#111111', stageOf)).toBe('#abcdef');
  });
});

describe('drawFurnitureItem — tô màu theo công đoạn', () => {
  it('có màu công đoạn thì tô bằng màu đó, không phải màu danh mục', () => {
    const { ctx, styles } = fakeCtx();
    drawFurnitureItem(cs(ctx), item({ catalogId: 'ell' }), false, '#10b981');
    const fills = styles.filter(([k]) => k === 'fillStyle').map(([, v]) => v);
    expect(fills).toContain('#10b981');
    expect(fills).not.toContain('#111111');
  });

  it('không có công đoạn thì về màu danh mục', () => {
    const { ctx, styles } = fakeCtx();
    drawFurnitureItem(cs(ctx), item({ catalogId: 'ell' }), false, undefined);
    expect(styles.filter(([k]) => k === 'fillStyle').map(([, v]) => v)).toContain('#111111');
  });
});

describe('drawFurnitureItem — vẽ biên dạng và cảnh báo va chạm', () => {
  it('block nằm đáy có footprint CAD -> vẽ đúng đa giác 6 đỉnh', () => {
    const { ctx, calls } = fakeCtx();
    drawFurnitureItem(cs(ctx), item({ catalogId: 'ell' }), false);
    const moves = calls.filter(([n]) => n === 'moveTo');
    const lines = calls.filter(([n]) => n === 'lineTo');
    expect(moves).toHaveLength(1);
    expect(lines).toHaveLength(5); // 6 đỉnh = 1 moveTo + 5 lineTo
    // y bản vẽ hướng lên, canvas hướng xuống -> đỉnh đầu (-200,-200) thành (-200, 200)
    expect(moves[0].slice(1)).toEqual([-200, 200]);
  });

  it('lật dựng đứng -> không vẽ polygon CAD nữa', () => {
    const { ctx, calls } = fakeCtx();
    drawFurnitureItem(cs(ctx), item({ catalogId: 'ell', orientation: 'end' }), false);
    expect(calls.filter(([n]) => n === 'lineTo')).not.toHaveLength(5);
  });

  it('đang va chạm -> phủ đỏ và viền đứt đỏ', () => {
    const { ctx, calls, styles } = fakeCtx();
    drawFurnitureItem(cs(ctx), item({ catalogId: 'ell' }), false, undefined, false, true);
    expect(styles.map(([, v]) => v)).toContain('rgba(220,38,38,0.25)');
    expect(styles.filter(([k]) => k === 'strokeStyle').map(([, v]) => v)).toContain('#dc2626');
    expect(calls.some(([n, a]) => n === 'setLineDash' && Array.isArray(a) && a.length === 2)).toBe(true);
    expect(calls.some(([n]) => n === 'strokeRect')).toBe(true);
  });

  it('ngoài vùng -> viền đứt đỏ nhưng KHÔNG phủ nền đỏ', () => {
    const { ctx, styles } = fakeCtx();
    drawFurnitureItem(cs(ctx), item({ catalogId: 'ell' }), false, undefined, true, false);
    expect(styles.filter(([k]) => k === 'strokeStyle').map(([, v]) => v)).toContain('#dc2626');
    expect(styles.map(([, v]) => v)).not.toContain('rgba(220,38,38,0.25)');
  });

  it('bình thường -> không có dấu hiệu đỏ nào', () => {
    const { ctx, styles } = fakeCtx();
    drawFurnitureItem(cs(ctx), item({ catalogId: 'ell' }), false);
    expect(styles.map(([, v]) => v)).not.toContain('#dc2626');
  });
});
