/**
 * Unit tests for the MISSION-CRITICAL cron decision logic — the morning
 * market-planner and the evening settlement engine — with no chain and no
 * network. The chain I/O lives in `main()` (guarded by `import.meta.main`);
 * everything that decides *what markets exist* and *who gets paid* is a pure /
 * injectable function tested here.
 *
 *   bun test test/meridian/cron.spec.ts
 */
import { test, expect, describe } from 'bun:test';
import { settlementOutcome, fetchCloses, settlePass } from '../../src/meridian/evening.js';
import { planMarkets } from '../../src/meridian/morning.js';
import { retryUntil } from '../../src/meridian/retry.js';
import { calculateStrikes } from '../../src/meridian/strikes.js';
import type { PriceQuote } from '../../src/meridian/prices.js';
import type { MeridianRow } from '../../src/meridian/db.js';
import type { Ticker } from '../../src/meridian/constants.js';

// --- fixtures -------------------------------------------------------------

function quote(symbol: Ticker, close: number, opts: Partial<PriceQuote> = {}): PriceQuote {
  return {
    symbol,
    close,
    previousClose: opts.previousClose ?? close,
    timestamp: opts.timestamp ?? 1_700_000_000,
    isClosed: opts.isClosed ?? true,
    sources: opts.sources ?? [{ name: 'override', close }],
    divergence: opts.divergence ?? 0,
  };
}

function row(ticker: Ticker, strike: number, collectionId = `${ticker}-${strike}`): MeridianRow {
  return {
    collection_id: collectionId,
    ticker,
    strike,
    close_date: '2099-01-15',
    settled: 0,
    settlement_price: null,
    settlement_outcome: null,
    created_at: 1,
    settled_at: null,
  };
}

// =========================================================================
// settlementOutcome — the payout rule. close ≥ strike → YES.
// =========================================================================
describe('settlementOutcome (payout rule)', () => {
  test('close strictly above strike → YES', () => {
    expect(settlementOutcome(231, 230)).toBe('yes');
  });

  test('close exactly at strike → YES (the boundary the "≥ $strike" name promises)', () => {
    expect(settlementOutcome(230, 230)).toBe('yes');
  });

  test('close one cent below strike → NO', () => {
    expect(settlementOutcome(229.99, 230)).toBe('no');
  });

  test('close far below strike → NO', () => {
    expect(settlementOutcome(0, 230)).toBe('no');
  });
});

// =========================================================================
// fetchCloses — the "is the session actually closed?" gate that protects the
// payout from settling against a mid-session / stale price.
// =========================================================================
describe('fetchCloses (close-readiness gate)', () => {
  test('a closed session contributes its close', async () => {
    const closes = await fetchCloses(['AAPL'], false, async () => quote('AAPL', 230, { isClosed: true }));
    expect(closes.get('AAPL')).toBe(230);
  });

  test('a NON-closed session is DEFERRED (excluded) when force is off', async () => {
    const closes = await fetchCloses(['AAPL'], false, async () => quote('AAPL', 230, { isClosed: false }));
    expect(closes.has('AAPL')).toBe(false); // stays outstanding for the next retry pass
  });

  test('a NON-closed session settles anyway when MERIDIAN_FORCE_SETTLE is on', async () => {
    const closes = await fetchCloses(['AAPL'], true, async () => quote('AAPL', 230, { isClosed: false }));
    expect(closes.get('AAPL')).toBe(230);
  });

  test('a fetch failure excludes only that ticker (never throws out of the batch)', async () => {
    const closes = await fetchCloses(['AAPL'], false, async (t) => {
      if (t === 'AAPL') throw new Error('oracle divergence guard tripped');
      return quote(t, 100);
    });
    expect(closes.has('AAPL')).toBe(false);
  });

  test('a mixed batch keeps only the closed, successfully-fetched tickers', async () => {
    const closes = await fetchCloses(['AAPL', 'MSFT', 'NVDA'], false, async (t) => {
      if (t === 'AAPL') return quote('AAPL', 230, { isClosed: true }); // keep
      if (t === 'MSFT') return quote('MSFT', 420, { isClosed: false }); // defer
      throw new Error('NVDA source down'); // drop
    });
    expect([...closes.keys()].sort()).toEqual(['AAPL']);
    expect(closes.get('AAPL')).toBe(230);
  });
});

// =========================================================================
// settlePass — applies known closes to outstanding rows and returns the rows
// STILL unsettled, so the retry loop only re-tries what's left (idempotency).
// =========================================================================
describe('settlePass (retry-leftover semantics)', () => {
  const alwaysSettles = async () => true;

  test('a row whose ticker has no close yet stays outstanding', async () => {
    const left = await settlePass([row('AAPL', 230)], new Map(), alwaysSettles);
    expect(left.map((r) => r.collection_id)).toEqual(['AAPL-230']);
  });

  test('a row that settles is removed from the outstanding set', async () => {
    const closes = new Map<Ticker, number>([['AAPL', 230]]);
    const left = await settlePass([row('AAPL', 230)], closes, alwaysSettles);
    expect(left).toEqual([]);
  });

  test('a settleFn that reports failure (returns false) leaves the row outstanding', async () => {
    const closes = new Map<Ticker, number>([['AAPL', 230]]);
    const left = await settlePass([row('AAPL', 230)], closes, async () => false);
    expect(left.map((r) => r.collection_id)).toEqual(['AAPL-230']);
  });

  test('a settleFn that THROWS leaves the row outstanding (one bad vote never aborts the batch)', async () => {
    const closes = new Map<Ticker, number>([['AAPL', 230]]);
    const left = await settlePass([row('AAPL', 230)], closes, async () => {
      throw new Error('broadcast rejected: account sequence mismatch');
    });
    expect(left.map((r) => r.collection_id)).toEqual(['AAPL-230']);
  });

  test('partial batch: settles what it can, returns the rest', async () => {
    const rows = [row('AAPL', 230), row('MSFT', 420), row('NVDA', 100)];
    const closes = new Map<Ticker, number>([
      ['AAPL', 230], // settles
      ['NVDA', 100], // settleFn will throw for NVDA
    ]); // MSFT has no close → stays
    const left = await settlePass(rows, closes, async (r) => {
      if (r.ticker === 'NVDA') throw new Error('vote failed');
      return true;
    });
    expect(left.map((r) => r.ticker).sort()).toEqual(['MSFT', 'NVDA']);
  });

  test('the settleFn receives the close it should record the outcome from', async () => {
    const seen: Array<{ ticker: string; strike: number; close: number; outcome: string }> = [];
    const closes = new Map<Ticker, number>([['AAPL', 235]]);
    await settlePass([row('AAPL', 230), row('AAPL', 240)], closes, async (r, close) => {
      seen.push({ ticker: r.ticker, strike: r.strike, close, outcome: settlementOutcome(close, r.strike) });
      return true;
    });
    // close 235 → YES on the $230 strike, NO on the $240 strike.
    expect(seen).toEqual([
      { ticker: 'AAPL', strike: 230, close: 235, outcome: 'yes' },
      { ticker: 'AAPL', strike: 240, close: 235, outcome: 'no' },
    ]);
  });
});

// =========================================================================
// settlePass + retryUntil — the exact composition main() uses. Proves the loop
// converges when a close that was missing on pass 1 arrives on pass 2.
// =========================================================================
describe('settle retry convergence (settlePass under retryUntil)', () => {
  test('a close that appears on pass 2 settles everything; loop exits non-exhausted', async () => {
    const rows = [row('AAPL', 230)];
    let outstanding = rows;
    let pass = 0;
    const res = await retryUntil(
      async () => {
        pass++;
        // Close is missing on pass 1, present from pass 2 on (mimics the
        // official close print landing a few minutes after 4 PM ET).
        const closes = pass >= 2 ? new Map<Ticker, number>([['AAPL', 230]]) : new Map<Ticker, number>();
        outstanding = await settlePass(outstanding, closes, async () => true);
        return outstanding;
      },
      { intervalMs: 1, windowMs: 1_000, now: makeClock([0, 1, 2]), sleep: async () => {} },
    );
    expect(res.remaining).toEqual([]);
    expect(res.exhausted).toBe(false);
    expect(res.attempts).toBe(2);
  });

  test('a close that never arrives leaves the row outstanding + exhausts the window', async () => {
    const rows = [row('AAPL', 230)];
    let outstanding = rows;
    const res = await retryUntil(
      async () => {
        outstanding = await settlePass(outstanding, new Map(), async () => true);
        return outstanding;
      },
      { intervalMs: 30, windowMs: 100, now: makeClock([0, 30, 60, 90, 120]), sleep: async () => {} },
    );
    expect(res.remaining.map((r) => r.collection_id)).toEqual(['AAPL-230']);
    expect(res.exhausted).toBe(true);
  });
});

// =========================================================================
// planMarkets — the morning expansion of quotes → the exact markets to create.
// =========================================================================
describe('planMarkets (morning market expansion)', () => {
  test('one spec per unique strike for a single ticker, close-date propagated', () => {
    const specs = planMarkets([quote('META', 680, { previousClose: 680 })], '2099-01-15');
    expect(specs.length).toBe(7); // 620..740, no dedup at this price
    expect(specs.every((s) => s.ticker === 'META')).toBe(true);
    expect(specs.every((s) => s.closeDate === '2099-01-15')).toBe(true);
    expect(specs.map((s) => s.strike)).toEqual(calculateStrikes(680));
  });

  test('low-priced ticker collapses to the deduped strike set (≤7)', () => {
    const specs = planMarkets([quote('AAPL', 230, { previousClose: 230 })], '2099-01-15');
    expect(specs.length).toBe(calculateStrikes(230).length);
    expect(specs.length).toBeLessThan(7);
  });

  test('multiple tickers expand independently; total = sum of each unique strike set', () => {
    const quotes = [
      quote('META', 680, { previousClose: 680 }),
      quote('AAPL', 230, { previousClose: 230 }),
      quote('TSLA', 417, { previousClose: 417 }),
    ];
    const specs = planMarkets(quotes, '2099-01-15');
    const expected = quotes.reduce((n, q) => n + calculateStrikes(q.previousClose).length, 0);
    expect(specs.length).toBe(expected);
    expect(new Set(specs.map((s) => s.ticker))).toEqual(new Set(['META', 'AAPL', 'TSLA']));
  });

  test('no quotes → no markets', () => {
    expect(planMarkets([], '2099-01-15')).toEqual([]);
  });
});

/** Deterministic clock for the retryUntil composition tests. */
function makeClock(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
