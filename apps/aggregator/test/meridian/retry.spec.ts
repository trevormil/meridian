/**
 * Unit tests for the retry utilities. Pure — injected now/sleep, no real waiting.
 *
 *   bun test test/meridian/retry.spec.ts
 */
import { test, expect } from 'bun:test';
import { retryUntil, withBackoff } from '../../src/meridian/retry.js';

const noSleep = async () => {};

test('withBackoff succeeds on the Nth attempt', async () => {
  let calls = 0;
  const delays: number[] = [];
  const out = await withBackoff(
    async () => {
      calls++;
      if (calls < 3) throw new Error(`fail ${calls}`);
      return 'ok';
    },
    { attempts: 5, baseMs: 10, factor: 2, sleep: async (ms) => { delays.push(ms); } },
  );
  expect(out).toBe('ok');
  expect(calls).toBe(3);
  // Two retries before success, with growing delays (10, 20).
  expect(delays).toEqual([10, 20]);
});

test('withBackoff throws the last error after exhausting attempts', async () => {
  let calls = 0;
  await expect(
    withBackoff(
      async () => { calls++; throw new Error(`boom ${calls}`); },
      { attempts: 3, baseMs: 1, sleep: noSleep },
    ),
  ).rejects.toThrow('boom 3');
  expect(calls).toBe(3);
});

test('withBackoff honors maxMs cap and shouldRetry=false short-circuit', async () => {
  const delays: number[] = [];
  await expect(
    withBackoff(
      async () => { throw new Error('nope'); },
      { attempts: 2, baseMs: 1000, factor: 100, maxMs: 1500, sleep: async (ms) => { delays.push(ms); } },
    ),
  ).rejects.toThrow('nope');
  expect(delays).toEqual([1000]); // capped below maxMs on first retry

  let calls = 0;
  await expect(
    withBackoff(
      async () => { calls++; throw new Error('permanent'); },
      { attempts: 5, baseMs: 1, sleep: noSleep, shouldRetry: () => false },
    ),
  ).rejects.toThrow('permanent');
  expect(calls).toBe(1); // stopped immediately
});

test('retryUntil stops early when a pass reports nothing outstanding', async () => {
  let attempt = 0;
  const res = await retryUntil(
    async () => { attempt++; return attempt >= 2 ? [] : ['x']; },
    { intervalMs: 10, windowMs: 1_000, now: makeClock([0, 10, 20]), sleep: noSleep },
  );
  expect(res.remaining).toEqual([]);
  expect(res.exhausted).toBe(false);
  expect(res.attempts).toBe(2);
});

test('retryUntil exhausts and returns the remaining items', async () => {
  const res = await retryUntil(
    async () => ['a', 'b'], // never clears
    { intervalMs: 30, windowMs: 100, now: makeClock([0, 30, 60, 90, 120]), sleep: noSleep },
  );
  expect(res.remaining).toEqual(['a', 'b']);
  expect(res.exhausted).toBe(true);
  // Passes while there was room for another interval: at elapsed 0, 30, 60 (90+30>100 stops).
  expect(res.attempts).toBe(3);
});

test('retryUntil runs exactly one pass when windowMs <= 0', async () => {
  let attempt = 0;
  const res = await retryUntil(
    async () => { attempt++; return ['still-here']; },
    { intervalMs: 30_000, windowMs: 0, sleep: noSleep },
  );
  expect(res.attempts).toBe(1);
  expect(res.exhausted).toBe(true);
  expect(res.remaining).toEqual(['still-here']);
});

/** Deterministic clock: returns successive values, holding the last one. */
function makeClock(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
