/**
 * Yahoo Finance integration tests. These hit the real public endpoint, so
 * they need network. Skipped in CI by setting `SKIP_NETWORK_TESTS=1`.
 *
 *   bun test test/meridian/prices.spec.ts
 */
import { test, expect } from 'bun:test';
import {
  fetchPriceQuote,
  fetchAllQuotes,
  aggregateQuotes,
  median,
  type SourceQuote,
} from '../../src/meridian/prices.js';
import { MAG7 } from '../../src/meridian/constants.js';

const SKIP = process.env.SKIP_NETWORK_TESTS === '1';

// Helper to build a source reading for the network-free aggregation tests.
function src(name: string, close: number, previousClose: number | null, isClosed = true): SourceQuote {
  return { name, close, previousClose, timestamp: 1_700_000_000, isClosed };
}

test.skipIf(SKIP)('fetchPriceQuote(META) returns valid quote', async () => {
  const q = await fetchPriceQuote('META');
  expect(q.symbol).toBe('META');
  expect(q.close).toBeGreaterThan(0);
  expect(q.previousClose).toBeGreaterThan(0);
  expect(q.timestamp).toBeGreaterThan(1_700_000_000); // > 2023
  // META trades > $100 generally — sanity check
  expect(q.close).toBeGreaterThan(100);
});

test.skipIf(SKIP)('fetchAllQuotes returns all MAG7', async () => {
  const quotes = await fetchAllQuotes(MAG7);
  expect(quotes.length).toBeGreaterThanOrEqual(6); // tolerate occasional rate-limit
  const symbols = new Set(quotes.map((q) => q.symbol));
  for (const s of MAG7.slice(0, 6)) expect(symbols.has(s)).toBe(true);
});

// --- Network-free oracle aggregation tests ---

test('median() handles odd and even counts', () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([1, 2, 3, 4])).toBe(2.5);
  expect(median([42])).toBe(42);
  expect(() => median([])).toThrow();
});

test('aggregateQuotes picks the median close and previousClose', () => {
  // Within the 1% divergence limit: 100 / 100.5 / 101 → median 100.5.
  const q = aggregateQuotes('META', [
    src('yahoo-q1', 100, 99),
    src('yahoo-q2', 100.5, 99.5),
    src('stooq', 101, null),
  ]);
  expect(q.close).toBe(100.5);
  // previousClose medians only the sources that carry it (99, 99.5) → 99.25.
  expect(q.previousClose).toBe(99.25);
  expect(q.sources.length).toBe(3);
  expect(q.divergence).toBeLessThan(1);
});

test('aggregateQuotes aborts below minimum sources', () => {
  expect(() => aggregateQuotes('META', [src('yahoo-q1', 100, 99)])).toThrow(/need ≥2/);
});

test('aggregateQuotes aborts when sources diverge beyond 1%', () => {
  expect(() =>
    aggregateQuotes('META', [
      src('yahoo-q1', 100, 99),
      src('yahoo-q2', 101, 99.5),
      src('stooq', 103, null),
    ]),
  ).toThrow(/divergence/);
});

test('aggregateQuotes ignores null previousClose but still uses the close', () => {
  // Stooq-style: close present, previousClose null. Stooq's close still counts
  // toward the median close; only Yahoo carries previousClose.
  const q = aggregateQuotes('META', [
    src('yahoo-q1', 200, 195),
    src('stooq', 201, null),
  ]);
  expect(q.close).toBe(200.5); // median of 200, 201
  expect(q.previousClose).toBe(195); // only Yahoo carried it
});

test('aggregateQuotes is closed only when every source agrees', () => {
  const allClosed = aggregateQuotes('META', [src('yahoo-q1', 100, 99, true), src('stooq', 100.5, null, true)]);
  expect(allClosed.isClosed).toBe(true);
  const oneOpen = aggregateQuotes('META', [src('yahoo-q1', 100, 99, true), src('stooq', 100.5, null, false)]);
  expect(oneOpen.isClosed).toBe(false);
});

test('aggregateQuotes accepts divergence exactly AT the limit (boundary is inclusive)', () => {
  // 1% limit, median 100.5 → a 100/101 spread is ≈0.995% and must NOT throw.
  const q = aggregateQuotes('META', [src('yahoo-q1', 100, 99), src('yahoo-q2', 101, 99.5)], {
    divergencePct: 1,
  });
  expect(q.divergence).toBeLessThanOrEqual(1);
});

test('aggregateQuotes throws when no source carries a previousClose', () => {
  // Two Stooq-style readings: close present, previousClose null on both.
  expect(() =>
    aggregateQuotes('META', [src('stooq', 200, null), src('stooq2', 200.5, null)]),
  ).toThrow(/no source carried a previousClose/);
});

test('aggregateQuotes honors custom minSources / divergencePct options', () => {
  // minSources:3 → two responders is not enough to cross-check.
  expect(() =>
    aggregateQuotes('META', [src('a', 100, 99), src('b', 100.5, 99)], { minSources: 3 }),
  ).toThrow(/need ≥3/);
  // A tighter 0.1% divergence limit rejects a spread the default 1% would allow.
  expect(() =>
    aggregateQuotes('META', [src('a', 100, 99), src('b', 100.5, 99)], { divergencePct: 0.1 }),
  ).toThrow(/divergence/);
});

test('aggregateQuotes reports the freshest timestamp across sources', () => {
  const q = aggregateQuotes('META', [
    { name: 'a', close: 100, previousClose: 99, timestamp: 1_700_000_000, isClosed: true },
    { name: 'b', close: 100.5, previousClose: 99, timestamp: 1_700_009_999, isClosed: true },
  ]);
  expect(q.timestamp).toBe(1_700_009_999);
});

test('MERIDIAN_PRICE_OVERRIDE honors isClosed:false (forces a non-closed reading through)', async () => {
  const prevOverride = process.env.MERIDIAN_PRICE_OVERRIDE;
  process.env.MERIDIAN_PRICE_OVERRIDE = JSON.stringify({
    META: { close: 500, previousClose: 490, isClosed: false },
  });
  try {
    const q = await fetchPriceQuote('META');
    expect(q.close).toBe(500);
    expect(q.isClosed).toBe(false); // evening.ts will DEFER this unless force-settle
  } finally {
    if (prevOverride === undefined) delete process.env.MERIDIAN_PRICE_OVERRIDE;
    else process.env.MERIDIAN_PRICE_OVERRIDE = prevOverride;
  }
});

test('MERIDIAN_PRICE_OVERRIDE bypasses Yahoo', async () => {
  const prevOverride = process.env.MERIDIAN_PRICE_OVERRIDE;
  process.env.MERIDIAN_PRICE_OVERRIDE = JSON.stringify({
    META: { close: 999.99, previousClose: 888.88 },
  });
  try {
    const q = await fetchPriceQuote('META');
    expect(q.close).toBe(999.99);
    expect(q.previousClose).toBe(888.88);
    expect(q.isClosed).toBe(true);
  } finally {
    if (prevOverride === undefined) delete process.env.MERIDIAN_PRICE_OVERRIDE;
    else process.env.MERIDIAN_PRICE_OVERRIDE = prevOverride;
  }
});
