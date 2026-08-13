import { describe, it, expect } from 'vitest';
import { ConvertQueue } from '../server/cad/queue.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ConvertQueue', () => {
  it('runs at most `concurrency` jobs at once and processes all', async () => {
    let running = 0;
    let peak = 0;
    const done: string[] = [];
    const q = new ConvertQueue(async (id) => {
      running++;
      peak = Math.max(peak, running);
      await sleep(30);
      running--;
      done.push(id);
    }, 2);
    for (const id of ['a', 'b', 'c', 'd', 'e']) q.enqueue(id);
    await q.idle();
    expect(done.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(peak).toBe(2);
  });

  it('a throwing job does not stop the queue', async () => {
    const done: string[] = [];
    const q = new ConvertQueue(async (id) => {
      if (id === 'boom') throw new Error('x');
      done.push(id);
    }, 1);
    q.enqueue('boom');
    q.enqueue('ok');
    await q.idle();
    expect(done).toEqual(['ok']);
  });

  it('does not enqueue the same id twice while pending', async () => {
    let calls = 0;
    const q = new ConvertQueue(async () => {
      calls++;
      await sleep(20);
    }, 1);
    q.enqueue('x');
    q.enqueue('x');
    await q.idle();
    expect(calls).toBe(1);
  });
});
