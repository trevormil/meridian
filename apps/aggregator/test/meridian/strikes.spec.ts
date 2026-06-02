/**
 * Unit tests for the strike calculator. No chain interaction.
 *
 *   bun test test/meridian/strikes.spec.ts
 */
import { test, expect } from 'bun:test';
import { calculateStrikes, strikeRoundTo } from '../../src/meridian/strikes.js';

test('META @ $680 → 7 unique strikes at $20 spacing (high price → $10 round)', () => {
  // 3% of 680 = $20.4 ≥ $10 → roundTo = 10
  // ±3/6/9% of 680 = 20.4, 40.8, 61.2 → rounded to $10 → 620, 640, 660, 680, 700, 720, 740
  const ks = calculateStrikes(680);
  expect(ks).toEqual([620, 640, 660, 680, 700, 720, 740]);
});

test('AAPL @ $230 → 7 unique strikes (low price drops round to $5)', () => {
  // 3% of 230 = $6.9 < $10 → roundTo = 5; dynamic round-step avoids the
  // adjacent-offset collisions a fixed $10 round produced.
  const ks = calculateStrikes(230);
  expect(ks).toEqual([210, 215, 225, 230, 235, 245, 250]);
});

test('TSLA @ $417 → 7 strikes ($10 round)', () => {
  // 3% of 417 = $12.51 ≥ $10 → roundTo = 10
  const ks = calculateStrikes(417);
  expect(ks).toEqual([380, 390, 400, 420, 430, 440, 450]);
});

test('NVDA @ $223 → 7 strikes (low price drops round to $5)', () => {
  // 3% of 223 = $6.69 < $10 → roundTo = 5
  // Under the old $10 round this only produced 5 unique strikes;
  // the dynamic round keeps every ±3% offset in its own bucket.
  const ks = calculateStrikes(223);
  expect(ks).toEqual([205, 210, 215, 225, 230, 235, 245]);
});

test('strikeRoundTo crossover at 3% = $10 (prevClose ≈ $333)', () => {
  expect(strikeRoundTo(100)).toBe(5);
  expect(strikeRoundTo(300)).toBe(5);
  expect(strikeRoundTo(333)).toBe(5); // 3% × 333 = $9.99, just under
  expect(strikeRoundTo(334)).toBe(10); // 3% × 334 = $10.02, just over
  expect(strikeRoundTo(1000)).toBe(10);
});

test('throws on bad input', () => {
  expect(() => calculateStrikes(0)).toThrow();
  expect(() => calculateStrikes(-1)).toThrow();
  expect(() => calculateStrikes(NaN)).toThrow();
});
