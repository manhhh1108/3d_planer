import { describe, it, expect } from 'vitest';
import { arrangeZone } from './autoArrange';
import { itemsCollide } from './collisionGeometry';
import { footprintRect } from './furnitureFootprint';
import { polygonFullyInside } from './zoneGeometry';
import type { Point } from '$lib/models/types';

const rectZone = (w: number, h: number): Point[] => [
  { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
];

describe('arrangeZone', () => {
  it('xếp 4 item 100x100 trong vùng 1000x1000: đều đặt được, trong vùng, không va chạm', () => {
    const zone = rectZone(1000, 1000);
    const items = [1, 2, 3, 4].map((n) => ({ id: `i${n}`, width: 100, depth: 100 }));
    const res = arrangeZone(zone, items, 20);
    expect(res.every((r) => r.placed)).toBe(true);
    for (const r of res) {
      const f = footprintRect(r.position, 100, 100, r.rotationDeg);
      expect(polygonFullyInside(f, zone)).toBe(true);
    }
    for (let i = 0; i < res.length; i++)
      for (let j = i + 1; j < res.length; j++) {
        const fi = footprintRect(res[i].position, 100, 100, res[i].rotationDeg);
        const fj = footprintRect(res[j].position, 100, 100, res[j].rotationDeg);
        expect(itemsCollide(fi, 20, fj, 20)).toBe(false);
      }
  });
  it('item to hơn vùng → placed=false', () => {
    const zone = rectZone(500, 500);
    const res = arrangeZone(zone, [{ id: 'big', width: 900, depth: 900 }], 10);
    expect(res[0].placed).toBe(false);
  });
  it('vùng hẹp: item chỉ lọt khi xoay 90°', () => {
    const zone = rectZone(300, 1000);
    const res = arrangeZone(zone, [{ id: 'bar', width: 900, depth: 250 }], 10);
    expect(res[0].placed).toBe(true);
    expect(res[0].rotationDeg).toBe(90);
  });

  it('trả kết quả cho MỌI item, kể cả cái không xếp được', () => {
    const zone = rectZone(400, 400);
    const res = arrangeZone(zone, [
      { id: 'vua', width: 100, depth: 100 },
      { id: 'qua-to', width: 900, depth: 900 },
    ], 10);
    expect(res).toHaveLength(2);
    expect(res.find((r) => r.id === 'vua')!.placed).toBe(true);
    expect(res.find((r) => r.id === 'qua-to')!.placed).toBe(false);
  });

  it('item to xếp trước item nhỏ', () => {
    const zone = rectZone(1000, 1000);
    const res = arrangeZone(zone, [
      { id: 'nho', width: 100, depth: 100 },
      { id: 'to', width: 400, depth: 100 },
    ], 10);
    // Xếp theo hàng từ trái sang, nên cái vào trước nằm bên trái
    const to = res.find((r) => r.id === 'to')!;
    const nho = res.find((r) => r.id === 'nho')!;
    expect(to.position.x).toBeLessThan(nho.position.x);
  });

  it('chừa đủ khoảng cách với mép vùng', () => {
    const margin = 50;
    const zone = rectZone(1000, 1000);
    const res = arrangeZone(zone, [{ id: 'a', width: 100, depth: 100 }], margin);
    expect(res[0].placed).toBe(true);
    // Mép trái/trên của item phải cách biên vùng ít nhất `margin`
    expect(res[0].position.x - 50).toBeGreaterThanOrEqual(margin - 1e-9);
    expect(res[0].position.y - 50).toBeGreaterThanOrEqual(margin - 1e-9);
  });

  it('xuống hàng khi hết chỗ ngang', () => {
    const zone = rectZone(500, 1000);
    const res = arrangeZone(zone, [1, 2, 3].map((n) => ({ id: `i${n}`, width: 200, depth: 100 })), 20);
    const placed = res.filter((r) => r.placed);
    expect(placed.length).toBeGreaterThanOrEqual(2);
    // Không thể nhét cả 3 trên một hàng rộng 500 -> phải có item ở hàng dưới
    const ys = new Set(placed.map((r) => Math.round(r.position.y)));
    expect(ys.size).toBeGreaterThan(1);
  });

  describe('vùng lõm', () => {
    /** Chữ L 1000x1000, khoét ô 500x500 ở góc phần tư trên-phải. */
    const L: Point[] = [
      { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 },
      { x: 500, y: 500 }, { x: 500, y: 1000 }, { x: 0, y: 1000 },
    ];

    it('mọi item xếp được đều nằm TRỌN trong hình thật, không lấn phần khoét', () => {
      const items = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `i${n}`, width: 200, depth: 200 }));
      const res = arrangeZone(L, items, 20);
      for (const r of res.filter((x) => x.placed)) {
        const f = footprintRect(r.position, 200, 200, r.rotationDeg);
        expect(polygonFullyInside(f, L), `item ${r.id} lọt ra ngoài vùng`).toBe(true);
      }
    });

    it('item rơi đúng phần khoét thì bị bỏ, không thử lại chỗ khác', () => {
      // Vùng lõm hẹp: hàng đầu vừa đủ, item sau rơi vào ô khoét
      const items = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `i${n}`, width: 400, depth: 400 }));
      const res = arrangeZone(L, items, 10);
      // Có item bị bỏ — đây là hạn chế đã biết của cách xếp theo khung bao
      expect(res.some((r) => !r.placed)).toBe(true);
    });
  });

  describe('vùng vẽ xiên', () => {
    /**
     * Vùng thật lấy từ mặt bằng "Xưởng lắp ráp": tứ giác nghiêng 25 cm trên
     * chiều dài 34,7 m. Bản cũ chạy con trỏ từ góc trên-trái KHUNG BAO, mà góc
     * đó nằm ngoài đa giác, nên không xếp nổi item nào dù vùng rộng 443 m².
     */
    const XIEN: Point[] = [
      { x: -725, y: -825 }, { x: 2750, y: -800 }, { x: 2725, y: 475 }, { x: -825, y: 425 },
    ];
    const BLOCKS = [
      { id: '10022-01', width: 1200, depth: 267 },
      { id: '10AY15241', width: 1106, depth: 317 },
      { id: 'ST4-7+8', width: 728, depth: 728 },
    ];

    it('xếp được hết, dù góc khung bao nằm ngoài vùng', () => {
      const res = arrangeZone(XIEN, BLOCKS, 54);
      expect(res.every((r) => r.placed)).toBe(true);
    });

    it('mọi item nằm trọn trong đa giác, không phải chỉ trong khung bao', () => {
      for (const r of arrangeZone(XIEN, BLOCKS, 54)) {
        const b = BLOCKS.find((x) => x.id === r.id)!;
        const f = footprintRect(r.position, b.width, b.depth, r.rotationDeg);
        expect(polygonFullyInside(f, XIEN), `${r.id} lọt ra ngoài`).toBe(true);
      }
    });
  });

  it('các item xếp ra luôn cách nhau ít nhất bằng khoảng cách yêu cầu', () => {
    const zone = rectZone(2000, 2000);
    const items = [
      { id: 'a', width: 400, depth: 200 },
      { id: 'b', width: 300, depth: 300 },
      { id: 'c', width: 200, depth: 500 },
      { id: 'd', width: 150, depth: 150 },
    ];
    const margin = 80;
    const res = arrangeZone(zone, items, margin);
    const placed = res.filter((r) => r.placed);
    expect(placed.length).toBe(4);

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const bi = items.find((x) => x.id === placed[i].id)!;
        const bj = items.find((x) => x.id === placed[j].id)!;
        const fi = footprintRect(placed[i].position, bi.width, bi.depth, placed[i].rotationDeg);
        const fj = footprintRect(placed[j].position, bj.width, bj.depth, placed[j].rotationDeg);
        expect(itemsCollide(fi, margin, fj, margin), `${placed[i].id} sát ${placed[j].id}`).toBe(false);
      }
    }
  });

  it('vùng khổng lồ vẫn chạy xong nhanh (có trần số bước quét)', () => {
    // 500 x 300 m — quét lưới mịn sẽ treo trình duyệt nếu không chặn
    const huge = rectZone(50000, 30000);
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, width: 800, depth: 600 }));
    const t0 = performance.now();
    const res = arrangeZone(huge, items, 100);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(res.every((r) => r.placed)).toBe(true);
  });
});
