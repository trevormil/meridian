import { type Ticker } from './constants.js';

/**
 * Price oracle — Yahoo Finance unauthenticated chart endpoint.
 *
 *   GET https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=5d
 *
 * Why Yahoo: free, no API key, returns OHLC + adjclose for the last N days.
 * For a production deployment you'd swap to Polygon / Alpha Vantage / IEX with
 * an API key, but for the V1 spec ("non-mainnet, no real funds") the
 * unauthenticated public endpoint is perfectly acceptable.
 *
 * The endpoint returns a JSON shape like:
 *   { chart: { result: [{ timestamp: [..], indicators: { quote: [{ close: [..] }] } }] } }
 *
 * We pull the daily series; the most recent entry is today's close (if the
 * market has closed) or today's last trade, and the prior entry is the
 * previous trading day's close.
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
  // Yahoo's chart endpoint rejects requests without a user agent on some
  // edge nodes. Spoof a normal browser UA.
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

export interface PriceQuote {
  symbol: Ticker;
  /** Most recent close (today if market has closed, else last trade). */
  close: number;
  /** Previous trading day's close — used for morning strike calc. */
  previousClose: number;
  /** Timestamp of the most recent data point (epoch seconds). */
  timestamp: number;
  /** True if the most recent point is the actual day's close (regular hours done). */
  isClosed: boolean;
}

const STALENESS_LIMIT_HOURS = 26; // accept up to ~1 day stale for prev-close

/**
 * Test/dev escape hatch: when `MERIDIAN_PRICE_OVERRIDE` is set to a JSON map
 * of {SYMBOL: {close, previousClose}}, return THOSE values instead of going
 * to Yahoo. Lets the e2e suite drive deterministic outcomes without
 * mocking the network. Production cron leaves the env unset.
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
    };
  } catch {
    return null;
  }
}

export async function fetchPriceQuote(symbol: Ticker): Promise<PriceQuote> {
  const override = priceOverride(symbol);
  if (override) return override;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=10d`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`Yahoo ${symbol}: HTTP ${r.status}`);
  const data = (await r.json()) as YahooChartResponse;
  if (data.chart.error) {
    throw new Error(`Yahoo ${symbol}: ${data.chart.error.description}`);
  }
  const result = data.chart.result?.[0];
  if (!result) throw new Error(`Yahoo ${symbol}: empty result`);

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
    throw new Error(`Yahoo ${symbol}: only ${series.length} valid bars, need ≥2`);
  }
  const last = series[series.length - 1];
  const prev = series[series.length - 2];

  const stalenessHours = (Date.now() / 1000 - last.t) / 3600;
  if (stalenessHours > STALENESS_LIMIT_HOURS) {
    throw new Error(
      `Yahoo ${symbol}: last bar is ${stalenessHours.toFixed(1)}h stale (limit ${STALENESS_LIMIT_HOURS}h)`,
    );
  }

  // regularMarketTime + a quote like 16:00 ET indicates the day's close is in.
  const isClosed = (result.meta.regularMarketTime ?? 0) > 0;

  return {
    symbol,
    close: last.c,
    previousClose: prev.c,
    timestamp: last.t,
    isClosed,
  };
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
