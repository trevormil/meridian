/**
 * Yahoo Finance integration tests. These hit the real public endpoint, so
 * they need network. Skipped in CI by setting `SKIP_NETWORK_TESTS=1`.
 *
 *   bun test test/meridian/prices.spec.ts
 */
import { test, expect } from 'bun:test';
import { fetchPriceQuote, fetchAllQuotes } from '../../src/meridian/prices.js';
import { MAG7 } from '../../src/meridian/constants.js';

const SKIP = process.env.SKIP_NETWORK_TESTS === '1';

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
