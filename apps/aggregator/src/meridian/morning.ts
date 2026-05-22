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
import { fetchAllQuotes } from './prices.js';
import { getOracleSigner, oracleBroadcast } from './signer.js';
import { ensureMeridianTables, findMarketByStrike, insertMeridianMarket, easternTradingDay } from './db.js';
import { assertTradingDay } from './trading-calendar.js';
import { env } from '../env.js';

interface MarketSpec {
  ticker: Ticker;
  strike: number;
  closeDate: string;
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
  // Skip on NYSE holidays (cron already excludes weekends). Set
  // MERIDIAN_FORCE=1 to override — useful for demos on a closed day.
  if (!process.env.MERIDIAN_FORCE && !assertTradingDay(closeDate, 'meridian:morning')) {
    return;
  }
  console.log(`[meridian:morning] run for trading day ${closeDate}`);

  console.log(`[meridian:morning] fetching previous closes for ${MAG7.length} tickers from Yahoo Finance`);
  const quotes = await fetchAllQuotes(MAG7);
  if (quotes.length === 0) {
    console.error('[meridian:morning] no quotes returned — aborting');
    process.exit(2);
  }

  const specs: MarketSpec[] = [];
  for (const q of quotes) {
    const strikes = calculateStrikes(q.previousClose);
    console.log(`[meridian:morning] ${q.symbol}: prev close $${q.previousClose.toFixed(2)} → strikes ${strikes.join(', ')}`);
    for (const k of strikes) specs.push({ ticker: q.symbol, strike: k, closeDate });
  }

  const signer = await getOracleSigner();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const spec of specs) {
    try {
      const before = findMarketByStrike(spec.ticker, spec.strike, spec.closeDate);
      const id = await createOne(signer, spec);
      if (id && !before) created++;
      else if (id && before) skipped++;
      else failed++;
    } catch (e) {
      console.error(`[meridian:morning] FAIL ${marketName(spec)}:`, (e as Error).message);
      failed++;
    }
    // Stagger txs a bit so the chain mempool isn't slammed with 49 heavy
    // MsgUniversalUpdateCollection in the same block.
    await new Promise((res) => setTimeout(res, 400));
  }

  console.log(
    `[meridian:morning] done: ${created} created, ${skipped} already-existed, ${failed} failed (of ${specs.length} planned)`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('[meridian:morning] uncaught:', e);
  process.exit(2);
});
