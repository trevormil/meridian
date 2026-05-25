/**
 * Meridian — 8:00 AM ET market-create script.
 *
 *   For each of the 7 MAG7 stocks:
 *     1. Read previous close from Yahoo Finance
 *     2. Compute strikes at ±3, ±6, ±9% (rounded to $10, dedup)
 *     3. For each unique strike: create a prediction-market collection
 *        on-chain via the oracle key (designated verifier = oracle)
 *     4. Record (collection_id, ticker, strike, close_date) in
 *        `meridian_markets` so the 4:05 PM settle script can find them
 *
 * Idempotent: re-running the same day skips strikes already created. Cron
 * should run this at 8:00 AM ET on US trading days (Mon-Fri).
 *
 *   bun run src/meridian/morning.ts
 */

import {
  buildPredictionMarket,
  encodeMsgsFromJson,
  GenericCosmosAdapter,
  BitBadgesSigningClient,
} from 'bitbadges';
import { MAG7, type Ticker, logoUrl } from './constants.js';
import { calculateStrikes } from './strikes.js';
import { fetchAllQuotes, type PriceQuote } from './prices.js';
import { getOracleSigner, oracleBroadcast } from './signer.js';
import { ensureMeridianTables, findMarketByStrike, insertMeridianMarket, easternTradingDay } from './db.js';
import { isTradingDay } from './calendar.js';
import { withBackoff } from './retry.js';
import { sendAlert } from './alert.js';
import { env } from '../env.js';

export interface MarketSpec {
  ticker: Ticker;
  strike: number;
  closeDate: string;
}

/**
 * Pure expansion of fetched quotes into the exact set of markets to create:
 * one spec per (ticker, unique strike) for the given trading day. Kept separate
 * from `main` (which does the chain I/O) so the "what gets created" decision is
 * unit-testable without a chain — the dedup is delegated to `calculateStrikes`,
 * so low-priced tickers correctly collapse to ~5 strikes instead of 7.
 */
export function planMarkets(quotes: PriceQuote[], closeDate: string): MarketSpec[] {
  const specs: MarketSpec[] = [];
  for (const q of quotes) {
    for (const strike of calculateStrikes(q.previousClose)) {
      specs.push({ ticker: q.symbol, strike, closeDate });
    }
  }
  return specs;
}

/**
 * Test runs set MERIDIAN_TEST_LABEL=E2E so the markets they spawn (which
 * stay on-chain forever even after the test cleans up its sidecar table
 * rows) are visually distinguishable + filterable by the aggregator.
 */
const TEST_LABEL = process.env.MERIDIAN_TEST_LABEL;

function marketName(spec: MarketSpec): string {
  // ≥ (not >) — settlement is "close AT OR ABOVE strike → YES". The name must
  // match the actual rule so traders aren't misled at the boundary.
  const base = `${spec.ticker} ≥ $${spec.strike}`;
  return TEST_LABEL ? `[${TEST_LABEL}] ${base}` : base;
}

function marketDescription(spec: MarketSpec): string {
  return `Will ${spec.ticker} close at or above $${spec.strike} on ${spec.closeDate}? Settles via oracle vote at ~4:05 PM ET on ${spec.closeDate}.`;
}

// Per-ticker logo URL is resolved from `constants.logoUrl()` (overridable via
// MERIDIAN_LOGO_BASE). Fall back to the BitBadges mark if a ticker isn't
// known to the logo mirror.
const FALLBACK_IMAGE = 'https://bitbadges.io/images/badge_logo.png';

/** Extract the freshly-created `collection_id` from a Cosmos tx response. */
async function getCollectionIdFromTx(txHash: string): Promise<string | null> {
  try {
    const r = await fetch(`${env.lcdUrl}/cosmos/tx/v1beta1/txs/${txHash}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { tx_response?: { events?: Array<{ type?: string; attributes?: Array<{ key?: string; value?: string }> }> } };
    for (const e of j.tx_response?.events ?? []) {
      if (e.type !== 'message' && e.type !== 'approvalChange') continue;
      for (const a of e.attributes ?? []) {
        if (a.key === 'collectionId' || a.key === 'collection_id') {
          if (a.value && /^\d+$/.test(a.value)) return a.value;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function createOne(signer: { client: BitBadgesSigningClient; address: string }, spec: MarketSpec): Promise<string | null> {
  // Skip if already exists for this (ticker, strike, date).
  const existing = findMarketByStrike(spec.ticker, spec.strike, spec.closeDate);
  if (existing) {
    console.log(`[meridian:morning] ${marketName(spec)} already exists → collection #${existing.collection_id}, skipping`);
    return existing.collection_id;
  }

  const msg = buildPredictionMarket({
    verifier: signer.address,
    name: marketName(spec),
    description: marketDescription(spec),
    image: logoUrl(spec.ticker) || FALLBACK_IMAGE,
    denom: 'USDC',
  }) as { typeUrl: string; value: Record<string, unknown> };
  // The SDK builder leaves `creator` blank — fill it in for the broadcaster.
  msg.value.creator = signer.address;

  const txHash = await oracleBroadcast(signer, [msg], `create ${marketName(spec)}`);
  // Need a beat for the chain to surface the collection ID via LCD.
  await new Promise((res) => setTimeout(res, 800));
  const collectionId = await getCollectionIdFromTx(txHash);
  if (!collectionId) {
    console.warn(`[meridian:morning] ${marketName(spec)} broadcast OK but couldn't extract collection_id from tx ${txHash.slice(0, 12)}…`);
    return null;
  }
  insertMeridianMarket({
    collectionId,
    ticker: spec.ticker,
    strike: spec.strike,
    closeDate: spec.closeDate,
  });
  console.log(`[meridian:morning] created ${marketName(spec)} → collection #${collectionId} (tx ${txHash.slice(0, 12)}…)`);
  return collectionId;
}

async function main(): Promise<void> {
  ensureMeridianTables();
  const closeDate = easternTradingDay();
  // Skip on NYSE holidays / weekends — a clean no-op so cron stays quiet on
  // closed days. Set MERIDIAN_FORCE=1 to override (useful for demos).
  if (!process.env.MERIDIAN_FORCE && !isTradingDay(closeDate)) {
    console.log(`[meridian:morning] ${closeDate} is not an NYSE trading day — skipping (no-op).`);
    return;
  }
  console.log(`[meridian:morning] run for trading day ${closeDate}`);

  console.log(`[meridian:morning] fetching previous closes for ${MAG7.length} tickers from Yahoo Finance`);
  // Retry the quote fetch with exponential backoff — a transient Yahoo/Stooq
  // blip shouldn't lose the whole day's market creation. fetchAllQuotes returns
  // [] (not a throw) when every source is down, so treat empty as retryable.
  const quotes = await withBackoff<PriceQuote[]>(
    async () => {
      const q = await fetchAllQuotes(MAG7);
      if (q.length === 0) throw new Error('no quotes returned from any source');
      return q;
    },
    {
      attempts: Number(process.env.MERIDIAN_MORNING_RETRY_ATTEMPTS ?? 4),
      baseMs: Number(process.env.MERIDIAN_MORNING_RETRY_BASE_MS ?? 2_000),
      factor: 2,
      maxMs: 30_000,
      onRetry: (e, a, d) =>
        console.warn(`[meridian:morning] quote fetch attempt ${a} failed (${(e as Error).message}); retrying in ${Math.round(d / 1000)}s`),
    },
  ).catch(() => [] as PriceQuote[]);
  if (quotes.length === 0) {
    console.error('[meridian:morning] no quotes after retries — aborting');
    await sendAlert(
      `Meridian morning: no market data (${closeDate})`,
      `fetchAllQuotes returned no usable quotes for any MAG7 ticker after retries. No markets were created for ${closeDate}. Check Yahoo/Stooq reachability and re-run meridian:morning.`,
    );
    process.exit(2);
  }

  for (const q of quotes) {
    console.log(`[meridian:morning] ${q.symbol}: prev close $${q.previousClose.toFixed(2)} → strikes ${calculateStrikes(q.previousClose).join(', ')}`);
  }
  const specs = planMarkets(quotes, closeDate);

  const signer = await getOracleSigner();
  let created = 0;
  let skipped = 0;
  const failedSpecs: MarketSpec[] = [];
  for (const spec of specs) {
    try {
      const before = findMarketByStrike(spec.ticker, spec.strike, spec.closeDate);
      const id = await createOne(signer, spec);
      if (id && !before) created++;
      else if (id && before) skipped++;
      else failedSpecs.push(spec);
    } catch (e) {
      console.error(`[meridian:morning] FAIL ${marketName(spec)}:`, (e as Error).message);
      failedSpecs.push(spec);
    }
    // Stagger txs a bit so the chain mempool isn't slammed with 49 heavy
    // MsgUniversalUpdateCollection in the same block.
    await new Promise((res) => setTimeout(res, 400));
  }

  console.log(
    `[meridian:morning] done: ${created} created, ${skipped} already-existed, ${failedSpecs.length} failed (of ${specs.length} planned)`,
  );
  if (failedSpecs.length > 0) {
    const lines = failedSpecs.map((s) => `• ${s.ticker} ≥ $${s.strike}`).join('\n');
    await sendAlert(
      `Meridian morning: ${failedSpecs.length} markets failed to create (${closeDate})`,
      `These strikes were not created and will be retried on the next morning run (idempotent):\n${lines}`,
    );
    process.exit(1);
  }
}

// Only run the cron when invoked as the entrypoint (`bun run morning.ts`).
// Importing this module (e.g. from the unit suite, to test planMarkets) must
// NOT fire a real market-creation run.
if (import.meta.main) {
  main().catch((e) => {
    console.error('[meridian:morning] uncaught:', e);
    process.exit(2);
  });
}
