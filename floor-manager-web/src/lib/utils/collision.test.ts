import { describe, it, expect } from 'vitest';
import { computeCollisions } from './collision';
import type { Point } from '$lib/models/types';

function foot(cx: number, cy: number, w = 10, h = 10): Point[] {
  return [{x:cx-w/2,y:cy-h/2},{x:cx+w/2,y:cy-h/2},{x:cx+w/2,y:cy+h/2},{x:cx-w/2,y:cy+h/2}];
}

describe('computeCollisions', () => {
  it('hai item xa → không va chạm', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const foots: Record<string, Point[]> = { a: foot(0,0), b: foot(500,0) };
    const s = computeCollisions(items, () => 50, (it) => foots[it.id]);
    expect(s.size).toBe(0);
  });
  it('hai item quá gần (trong margin) → cả hai va chạm', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const foots: Record<string, Point[]> = { a: foot(0,0), b: foot(30,0) };
    const s = computeCollisions(items, () => 50, (it) => foots[it.id]);
    expect(s.has('a')).toBe(true); expect(s.has('b')).toBe(true);
  });
});
