import { type Ticker } from './constants.js';

/**
 * Price oracle — median-of-N across THREE keyless public feeds.
 *
 * The payout-critical close is the cross-vendor median of:
 *   1. Yahoo  query1.finance.yahoo.com  /v8/finance/chart/{SYMBOL}
 *   2. Yahoo  query2.finance.yahoo.com  (same parser, different host —
 *      transport redundancy when one edge node rate-limits)
 *   3. Stooq  /q/l/ quote CSV (close-only; EOD semantics)
 *
 * Why median-of-3: a single feed returning a stale / wrong / null value at
 * 4:05 PM ET would otherwise settle every market for that day against it. The
 * median tolerates one bad reading, and a divergence guard refuses to settle
 * at all when the survivors disagree by more than a small tolerance.
 *
 * `aggregateQuotes()` is a PURE function (no network) so the cross-checking
 * logic is unit-testable in isolation; `fetchPriceQuote()` is the network
 * shell that fans out to the three sources and feeds the survivors in.
 *
 * Production multi-verifier path: the tokenization module supports k-of-n
 * verifier voting natively via `votingChallenges[]` (config, not new protocol
 * code). The single-signer oracle is retained for the demo.
 */

interface YahooChartResponse {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          close: Array<number | null>;
          open: Array<number | null>;
          high: Array<number | null>;
          low: Array<number | null>;
          volume: Array<number | null>;
        }>;
      };
      meta: {
        regularMarketTime?: number;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
      };
    }>;
    error?: { code: string; description: string };
  };
}

const HEADERS = {
  // Yahoo's chart endpoint (and Stooq on some edges) rejects requests without
  // a user agent. Spoof a normal browser UA.
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

export interface PriceQuote {
  symbol: Ticker;
  /** Cross-vendor median of all source closes (the payout-critical value). */
  close: number;
  /** Median previous close — Yahoo-redundant (Stooq's quote endpoint omits it). */
  previousClose: number;
  /** Timestamp of the freshest source data point (epoch seconds). */
  timestamp: number;
  /** True only if EVERY source agrees the session is closed (conservative). */
  isClosed: boolean;
  /** Per-source close that fed the median — audit trail. */
  sources: Array<{ name: string; close: number }>;
  /** (max-min)/median of the closes, as a percentage. */
  divergence: number;
}

/**
 * One source's reading, before cross-vendor aggregation. `previousClose` is
 * null for sources that don't carry it (Stooq's keyless quote endpoint).
 */
export interface SourceQuote {
  name: string;
  close: number;
  previousClose: number | null;
  timestamp: number;
  isClosed: boolean;
}

export interface AggregateOptions {
  /** Minimum responding sources required to settle (default 2). */
  minSources?: number;
  /** Max allowed (max-min)/median spread, as a percentage (default 1). */
  divergencePct?: number;
}

// Settlement freshness is now enforced by the isClosed gate + divergence check,
// not this floor — so it only needs to be loose enough to never reject a
// legitimate most-recent close. The previous 26h limit broke the morning
// script every Monday / post-holiday, when the most recent close is 60-88h old
// after a long weekend. 100h clears a Fri-close → Tue-morning gap with margin.
const STALENESS_LIMIT_HOURS = 100;

/** Median of a non-empty list of numbers. */
export function median(nums: number[]): number {
  if (nums.length === 0) throw new Error('median: empty input');
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * PURE cross-vendor aggregation (no network). Given the per-source readings
 * that survived fetching, produce the single settlement quote — or throw if
 * the readings can't be trusted.
 */
export function aggregateQuotes(
  symbol: Ticker,
  quotes: SourceQuote[],
  opts: AggregateOptions = {},
): PriceQuote {
  const minSources = opts.minSources ?? Number(process.env.MERIDIAN_PRICE_MIN_SOURCES ?? 2);
  const divergenceLimit = opts.divergencePct ?? Number(process.env.MERIDIAN_PRICE_DIVERGENCE_PCT ?? 1);

  // A lone reading can't be cross-checked — refuse rather than settle blind.
  if (quotes.length < minSources) {
    throw new Error(
      `${symbol}: only ${quotes.length} source(s) responded, need ≥${minSources} to cross-check`,
    );
  }

  const closes = quotes.map((q) => q.close);
  const med = median(closes);
  const divergence = med === 0 ? 0 : ((Math.max(...closes) - Math.min(...closes)) / med) * 100;
  if (divergence > divergenceLimit) {
    const detail = quotes.map((q) => `${q.name}=$${q.close}`).join(', ');
    throw new Error(
      `${symbol}: source divergence ${divergence.toFixed(3)}% exceeds ${divergenceLimit}% limit (${detail})`,
    );
  }

  // previousClose is Yahoo-redundant: Stooq's keyless quote endpoint omits it,
  // so we median only over the sources that carry it.
  const prevs = quotes.map((q) => q.previousClose).filter((v): v is number => v != null);
  if (prevs.length === 0) {
    throw new Error(`${symbol}: no source carried a previousClose`);
  }
  const previousClose = median(prevs);

  return {
    symbol,
    close: med,
    previousClose,
    // Conservative: only "closed" if every survivor agrees the session is done.
    isClosed: quotes.every((q) => q.isClosed),
    timestamp: Math.max(...quotes.map((q) => q.timestamp)),
    sources: quotes.map((q) => ({ name: q.name, close: q.close })),
    divergence,
  };
}

/**
 * Test/dev escape hatch: when `MERIDIAN_PRICE_OVERRIDE` is set to a JSON map
 * of {SYMBOL: {close, previousClose}}, return THOSE values instead of going
 * to the network. Lets the e2e suite drive deterministic outcomes without
 * mocking the network. Returns a single synthetic source with divergence 0.
 * Production cron leaves the env unset.
 */
function priceOverride(symbol: Ticker): PriceQuote | null {
  const raw = process.env.MERIDIAN_PRICE_OVERRIDE;
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, { close: number; previousClose: number; isClosed?: boolean }>;
    const entry = map[symbol];
    if (!entry) return null;
    return {
      symbol,
      close: entry.close,
      previousClose: entry.previousClose,
      timestamp: Math.floor(Date.now() / 1000),
      isClosed: entry.isClosed ?? true,
      sources: [{ name: 'override', close: entry.close }],
      divergence: 0,
    };
  } catch {
    return null;
  }
}

/** Yahoo chart endpoint, parameterized by host for transport redundancy. */
async function fetchYahoo(symbol: Ticker, host: string, name: string): Promise<SourceQuote> {
  const url = `https://${host}/v8/finance/chart/${symbol}?interval=1d&range=10d`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`${name} ${symbol}: HTTP ${r.status}`);
  const data = (await r.json()) as YahooChartResponse;
  if (data.chart.error) {
    throw new Error(`${name} ${symbol}: ${data.chart.error.description}`);
  }
  const result = data.chart.result?.[0];
  if (!result) throw new Error(`${name} ${symbol}: empty result`);

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  // Filter out null entries (Yahoo emits null for in-progress bars when the
  // market is mid-session and the bar hasn't closed yet).
  const series: Array<{ t: number; c: number }> = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    series.push({ t: timestamps[i], c });
  }
  if (series.length < 2) {
    throw new Error(`${name} ${symbol}: only ${series.length} valid bars, need ≥2`);
  }
  const last = series[series.length - 1];
  const prev = series[series.length - 2];

  const stalenessHours = (Date.now() / 1000 - last.t) / 3600;
  if (stalenessHours > STALENESS_LIMIT_HOURS) {
    throw new Error(
      `${name} ${symbol}: last bar is ${stalenessHours.toFixed(1)}h stale (limit ${STALENESS_LIMIT_HOURS}h)`,
    );
  }

  return {
    name,
    close: last.c,
    previousClose: prev.c,
    timestamp: last.t,
    // regularMarketTime > 0 indicates the day's close print is in.
    isClosed: (result.meta.regularMarketTime ?? 0) > 0,
  };
}

/**
 * Stooq keyless quote CSV. The daily-history d/l endpoint now requires an API
 * key, so we use the keyless q/l quote endpoint — it gives the close ONLY (no
 * previousClose), EOD semantics. Header is
 *   "Symbol,Date,Time,Open,High,Low,Close,Volume" — close is column index 6.
 * Unknown tickers come back as "N/D"; guard for non-numeric.
 */
async function fetchStooq(symbol: Ticker): Promise<SourceQuote> {
  const url = `https://stooq.com/q/l/?s=${symbol.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`stooq ${symbol}: HTTP ${r.status}`);
  const text = (await r.text()).trim();
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) throw new Error(`stooq ${symbol}: no data row`);
  const cols = lines[1].split(',');
  const closeRaw = cols[6]?.trim();
  const close = Number(closeRaw);
  if (!closeRaw || closeRaw === 'N/D' || !Number.isFinite(close) || close <= 0) {
    throw new Error(`stooq ${symbol}: non-numeric close "${closeRaw ?? ''}"`);
  }
  const parsed = Date.parse(`${cols[1]}T${cols[2] || '00:00:00'}Z`) / 1000;
  return {
    name: 'stooq',
    close,
    previousClose: null,
    timestamp: Number.isFinite(parsed) ? parsed : Math.floor(Date.now() / 1000),
    // q/l quote is EOD — treat as a closed-session reading.
    isClosed: true,
  };
}

export async function fetchPriceQuote(symbol: Ticker): Promise<PriceQuote> {
  const override = priceOverride(symbol);
  if (override) return override;

  const settled = await Promise.allSettled([
    fetchYahoo(symbol, 'query1.finance.yahoo.com', 'yahoo-q1'),
    fetchYahoo(symbol, 'query2.finance.yahoo.com', 'yahoo-q2'),
    fetchStooq(symbol),
  ]);

  const survivors: SourceQuote[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') survivors.push(s.value);
    else console.warn(`[oracle] ${symbol} source failed:`, s.reason?.message ?? s.reason);
  }

  return aggregateQuotes(symbol, survivors);
}

/** Fetch all MAG7 quotes in parallel. Returns successful entries; logs failures. */
export async function fetchAllQuotes(symbols: readonly Ticker[]): Promise<PriceQuote[]> {
  const results = await Promise.allSettled(symbols.map((s) => fetchPriceQuote(s)));
  const ok: PriceQuote[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      ok.push(r.value);
    } else {
      console.warn(`[oracle] price fetch failed for ${symbols[i]}:`, r.reason?.message ?? r.reason);
    }
  }
  return ok;
}
