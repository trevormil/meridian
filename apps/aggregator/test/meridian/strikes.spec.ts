/**
 * Unit tests for the strike calculator. No chain interaction.
 *
 *   bun test test/meridian/strikes.spec.ts
 */
import { test, expect } from 'bun:test';
import { calculateStrikes } from '../../src/meridian/strikes.js';

test('META @ $680 → 7 unique strikes at $20-30 spacing', () => {
  // ±3/6/9% of 680 = 20.4, 40.8, 61.2 → rounded to $10 → 620, 640, 660, 680, 700, 720, 740
  const ks = calculateStrikes(680);
  expect(ks).toEqual([620, 640, 660, 680, 700, 720, 740]);
});

test('AAPL @ $230 dedups (low-priced stocks have collisions)', () => {
  // ±3% = 6.9 (rounds to 0 → 230), ±6% = 13.8 (rounds to 10 → 220/240), ±9% = 20.7 (rounds to 20 → 210/250)
  // 3% and 0% collapse onto 230; 6% and 9% sit on different rounded values.
  const ks = calculateStrikes(230);
  // Verify dedup: should have ≤7 entries, sorted ascending.
  expect(ks.length).toBeLessThanOrEqual(7);
  expect(ks.length).toBeGreaterThanOrEqual(5);
  // Sorted ascending invariant
  for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThan(ks[i - 1]);
  // At-the-money strike present
  expect(ks).toContain(230);
});

test('TSLA @ $417 → 7 strikes (high enough that nothing dedups)', () => {
  const ks = calculateStrikes(417);
  expect(ks).toEqual([380, 390, 400, 420, 430, 440, 450]);
});

test('NVDA @ $223 collapses 0% and ±3% (all round to 220)', () => {
  // 223 × 0.91 = 202.93 → 200
  // 223 × 0.94 = 209.62 → 210
  // 223 × 0.97 = 216.31 → 220
  // 223 × 1.00 = 223.00 → 220   ← collides with -3%
  // 223 × 1.03 = 229.69 → 230
  // 223 × 1.06 = 236.38 → 240
  // 223 × 1.09 = 243.07 → 240   ← collides with +6%
  // Unique: 200, 210, 220, 230, 240
  const ks = calculateStrikes(223);
  expect(ks).toEqual([200, 210, 220, 230, 240]);
});

test('throws on bad input', () => {
  expect(() => calculateStrikes(0)).toThrow();
  expect(() => calculateStrikes(-1)).toThrow();
  expect(() => calculateStrikes(NaN)).toThrow();
});
