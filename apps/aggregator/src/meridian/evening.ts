/**
 * Meridian — 4:05 PM ET settle script.
 *
 *   For each (ticker, strike, today) row in `meridian_markets` not yet settled:
 *     1. Fetch today's closing price from Yahoo Finance
 *     2. Determine outcome: YES if close ≥ strike, else NO
 *     3. Cast vote on the corresponding settle approval (yes-wins / no-wins)
 *        using the oracle key — the oracle is the designated verifier on
 *        every Meridian market (set by the morning script)
 *     4. Mark the row settled with the close price + outcome
 *
 * Idempotent: rows with `settled=1` are skipped. Safe to retry the same day.
 *
 *   bun run src/meridian/evening.ts
 */

import { env } from '../env.js';
import { getDb } from '../db/index.js';
import { MAG7, type Ticker } from './constants.js';
import { fetchPriceQuote } from './prices.js';
import { getOracleSigner, oracleBroadcast } from './signer.js';
import { ensureMeridianTables, listUnsettledForDate, markSettled, easternTradingDay } from './db.js';

/** Read the cached collection JSON for `collectionId` from the aggregator DB. */
function loadCollectionJson(collectionId: string): any | null {
  const row = getDb()
    .prepare('SELECT raw_collection_json FROM markets WHERE collection_id = ?')
    .get(collectionId) as { raw_collection_json?: string } | undefined;
  if (!row?.raw_collection_json) return null;
  try {
    return JSON.parse(row.raw_collection_json);
  } catch {
    return null;
  }
}

function findApproval(collection: any, prefix: string): string | undefined {
  for (const a of collection?.collectionApprovals ?? []) {
    if (typeof a.approvalId === 'string' && a.approvalId.startsWith(prefix)) return a.approvalId;
  }
  return undefined;
}

interface VoteEnvelope {
  typeUrl: '/tokenization.MsgCastVote';
  value: {
    creator: string;
    collectionId: string;
    approvalLevel: 'collection';
    approverAddress: '';
    approvalId: string;
    proposalId: string;
    yesWeight: string;
  };
}

function buildVoteEnvelope(creator: string, collectionId: string, approvalId: string): VoteEnvelope {
  return {
    typeUrl: '/tokenization.MsgCastVote',
    value: {
      creator,
      collectionId,
      approvalLevel: 'collection',
      approverAddress: '',
      approvalId,
      proposalId: approvalId,
      yesWeight: '100',
    },
  };
}

/**
 * Wait until the aggregator's DB has the raw collection JSON for `collectionId`.
 * The morning script creates the market via a single tx, but the aggregator's
 * bootstrap scanner walks IDs forward + caches the collection JSON on a 15s
 * loop. We wait up to ~30s so the evening script has the approvalIds it needs.
 */
async function untilCollectionCached(collectionId: string, timeoutMs = 30_000): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = loadCollectionJson(collectionId);
    if (c) return c;
    await new Promise((res) => setTimeout(res, 1500));
  }
  return null;
}

async function settleOne(
  signer: { address: string; client: any },
  row: { collection_id: string; ticker: Ticker; strike: number },
  closingPrice: number,
): Promise<{ outcome: 'yes' | 'no' } | null> {
  const outcome: 'yes' | 'no' = closingPrice >= row.strike ? 'yes' : 'no';
  const collection = await untilCollectionCached(row.collection_id);
  if (!collection) {
    console.error(`[meridian:evening] ${row.ticker} > $${row.strike}: collection #${row.collection_id} not indexed by aggregator yet — skip`);
    return null;
  }
  // Prefix is `pm-settle-yes-` / `pm-settle-no-` (NOT `pm-settle-yes-wins-`).
  // Avoid colliding with `pm-settle-push-yes-` / `pm-settle-push-no-` by
  // matching ONLY the side prefix + the trailing hash, not the push approvals.
  const approvalId = collection?.collectionApprovals?.find((a: any) => {
    const id: string = a?.approvalId ?? '';
    if (!id.startsWith('pm-settle-')) return false;
    if (id.startsWith('pm-settle-push-')) return false;
    return outcome === 'yes' ? id.startsWith('pm-settle-yes-') : id.startsWith('pm-settle-no-');
  })?.approvalId;
  if (!approvalId) {
    console.error(`[meridian:evening] ${row.ticker} > $${row.strike}: missing ${outcome}-wins approval on #${row.collection_id}`);
    return null;
  }
  const envelope = buildVoteEnvelope(signer.address, row.collection_id, approvalId);
  await oracleBroadcast(signer, [envelope], `vote ${row.ticker}>$${row.strike} → ${outcome.toUpperCase()}`);
  console.log(
    `[meridian:evening] ${row.ticker} closed $${closingPrice.toFixed(2)} vs strike $${row.strike} → ${outcome.toUpperCase()} (#${row.collection_id})`,
  );
  return { outcome };
}

async function main(): Promise<void> {
  ensureMeridianTables();
  const closeDate = easternTradingDay();
  console.log(`[meridian:evening] run for trading day ${closeDate}`);

  const unsettled = listUnsettledForDate(closeDate);
  if (unsettled.length === 0) {
    console.log('[meridian:evening] nothing to settle for today');
    return;
  }

  // One Yahoo fetch per unique ticker.
  const tickers = [...new Set(unsettled.map((u) => u.ticker as Ticker))];
  console.log(`[meridian:evening] settling ${unsettled.length} markets across ${tickers.length} tickers`);
  const closes = new Map<Ticker, number>();
  for (const t of tickers) {
    try {
      const q = await fetchPriceQuote(t);
      closes.set(t, q.close);
      console.log(`[meridian:evening] ${t} close $${q.close.toFixed(2)} (closed=${q.isClosed})`);
      if (!q.isClosed) {
        console.warn(
          `[meridian:evening] ${t}: regularMarketTime suggests session is still live — settling against latest tick anyway`,
        );
      }
    } catch (e) {
      console.error(`[meridian:evening] ${t} price fetch failed:`, (e as Error).message);
    }
  }

  const signer = await getOracleSigner();
  let settled = 0;
  let failed = 0;
  for (const row of unsettled) {
    const close = closes.get(row.ticker as Ticker);
    if (close == null) {
      failed++;
      continue;
    }
    try {
      const r = await settleOne(signer, row as any, close);
      if (r) {
        markSettled({ collectionId: row.collection_id, outcome: r.outcome, settlementPrice: close });
        settled++;
      } else {
        failed++;
      }
    } catch (e) {
      console.error(`[meridian:evening] FAIL ${row.ticker}>$${row.strike}:`, (e as Error).message);
      failed++;
    }
    await new Promise((res) => setTimeout(res, 300));
  }

  console.log(`[meridian:evening] done: ${settled} settled, ${failed} failed (of ${unsettled.length})`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('[meridian:evening] uncaught:', e);
  process.exit(2);
});
