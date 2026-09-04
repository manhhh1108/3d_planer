import { describe, it, expect } from 'vitest';
import { resolveZoneForItem } from './zoneAssignment';
import type { WorkingZone } from '$lib/models/types';

const footprint = [
  { x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 },
];
const big: WorkingZone = { id: 'big', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], allowedStageIds: ['a'] };
const small: WorkingZone = { id: 'small', points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 50 }], allowedStageIds: ['b'] };

describe('resolveZoneForItem', () => {
  it('trọn trong 1 vùng -> trả vùng đó', () => {
    expect(resolveZoneForItem(footprint, [big])?.id).toBe('big');
  });
  it('trọn trong nhiều vùng chồng -> vùng nhỏ nhất', () => {
    expect(resolveZoneForItem(footprint, [big, small])?.id).toBe('small');
  });
  it('không trọn trong vùng nào -> null', () => {
    const outside = [{ x: 200, y: 200 }, { x: 210, y: 200 }, { x: 210, y: 210 }, { x: 200, y: 210 }];
    expect(resolveZoneForItem(outside, [big, small])).toBeNull();
  });
});
