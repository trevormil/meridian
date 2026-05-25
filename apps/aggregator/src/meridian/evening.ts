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
import { getCollection } from '../chain/lcd.js';
import { MAG7, type Ticker } from './constants.js';
import { fetchPriceQuote, type PriceQuote } from './prices.js';
import { getOracleSigner, oracleBroadcast } from './signer.js';
import { ensureMeridianTables, listUnsettledForDate, markSettled, easternTradingDay, type MeridianRow } from './db.js';
import { isTradingDay } from './calendar.js';
import { retryUntil } from './retry.js';
import { sendAlert } from './alert.js';

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

/** Direct LCD fallback for when the aggregator's view filters out the market
 *  (e.g. e2e [E2E]-labeled markets that bootstrap.isHiddenTestMarket skips).
 *  Same shape as the cached JSON; we only need `collectionApprovals` from it. */
async function fetchCollectionFromChain(collectionId: string): Promise<any | null> {
  try {
    return await getCollection(collectionId);
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
 * Resolve the collection JSON we need to extract approval IDs from. First
 * try the aggregator's cached `markets.raw_collection_json` (fast, no LCD
 * round-trip). If the aggregator filtered this market out (e.g. [E2E] test
 * markets hidden by `bootstrap.isHiddenTestMarket`), poll briefly and then
 * fall back to a direct chain query — the chain is the source of truth and
 * the script doesn't actually need the aggregator's cache to work.
 */
async function resolveCollection(collectionId: string, timeoutMs = 12_000): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = loadCollectionJson(collectionId);
    if (c) return c;
    await new Promise((res) => setTimeout(res, 1500));
  }
  // Aggregator never cached it. Fetch from chain LCD directly.
  return await fetchCollectionFromChain(collectionId);
}

async function settleOne(
  signer: { address: string; client: any },
  row: { collection_id: string; ticker: Ticker; strike: number },
  closingPrice: number,
): Promise<{ outcome: 'yes' | 'no' } | null> {
  const outcome: 'yes' | 'no' = closingPrice >= row.strike ? 'yes' : 'no';
  const collection = await resolveCollection(row.collection_id);
  if (!collection) {
    console.error(`[meridian:evening] ${row.ticker} > $${row.strike}: collection #${row.collection_id} not reachable via aggregator or LCD — skip`);
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

type FetchFn = (ticker: Ticker) => Promise<PriceQuote>;
/** Resolves a settlement close for `row` (already paired with its ticker's
 *  close). Returns true once the row is settled, false to leave it outstanding. */
type SettleFn = (row: MeridianRow, close: number) => Promise<boolean>;

/**
 * Fetch the settlement close for each ticker. A throw (fetch failure / oracle
 * guard) or a not-closed session (unless `forceSettle`) leaves the ticker out
 * of the map, so its markets stay outstanding for the next retry pass.
 */
export async function fetchCloses(
  tickers: Ticker[],
  forceSettle: boolean,
  fetchFn: FetchFn = fetchPriceQuote,
): Promise<Map<Ticker, number>> {
  const closes = new Map<Ticker, number>();
  for (const t of tickers) {
    try {
      const q = await fetchFn(t);
      const readings = q.sources.map((s) => `${s.name}=$${s.close.toFixed(2)}`).join(', ');
      if (!q.isClosed && !forceSettle) {
        console.warn(
          `[meridian:evening] ${t}: session not closed across sources — DEFERRING (set MERIDIAN_FORCE_SETTLE=true to override). [${readings}]`,
        );
        continue;
      }
      closes.set(t, q.close);
      console.log(
        `[meridian:evening] ${t} median close $${q.close.toFixed(2)} (closed=${q.isClosed}, divergence=${q.divergence.toFixed(3)}%) [${readings}]`,
      );
      if (!q.isClosed) {
        console.warn(`[meridian:evening] ${t}: settling a NON-closed session because MERIDIAN_FORCE_SETTLE=true`);
      }
    } catch (e) {
      console.error(`[meridian:evening] ${t} price fetch failed:`, (e as Error).message);
    }
  }
  return closes;
}

/**
 * Attempt to settle each outstanding row whose ticker has a known close.
 * Returns the rows STILL unsettled (no close yet, or the settle failed) so the
 * caller can retry just those.
 */
export async function settlePass(
  outstanding: MeridianRow[],
  closes: Map<Ticker, number>,
  settleFn: SettleFn,
): Promise<MeridianRow[]> {
  const stillUnsettled: MeridianRow[] = [];
  for (const row of outstanding) {
    const close = closes.get(row.ticker as Ticker);
    if (close == null) {
      stillUnsettled.push(row);
      continue;
    }
    try {
      const ok = await settleFn(row, close);
      if (!ok) stillUnsettled.push(row);
    } catch (e) {
      console.error(`[meridian:evening] FAIL ${row.ticker}>$${row.strike}:`, (e as Error).message);
      stillUnsettled.push(row);
    }
    // Stagger broadcasts so the mempool isn't slammed.
    await new Promise((res) => setTimeout(res, 300));
  }
  return stillUnsettled;
}

async function main(): Promise<void> {
  ensureMeridianTables();
  // Default: settle today's trading day. Override with MERIDIAN_CLOSE_DATE
  // (YYYY-MM-DD) to re-settle a day the cron missed — e.g. after an outage.
  // The Yahoo fetch returns the most-recent available close, so this is only
  // correct for the latest still-unsettled trading day (you can't fetch an
  // arbitrary historical close through this endpoint).
  const closeDate = process.env.MERIDIAN_CLOSE_DATE || easternTradingDay();
  // Skip on NYSE holidays / weekends (clean no-op) unless an explicit
  // close-date override is set (a manual re-settle of a missed day) or
  // MERIDIAN_FORCE=1.
  if (
    !process.env.MERIDIAN_CLOSE_DATE &&
    !process.env.MERIDIAN_FORCE &&
    !isTradingDay(closeDate)
  ) {
    console.log(`[meridian:evening] ${closeDate} is not an NYSE trading day — skipping (no-op).`);
    return;
  }
  console.log(`[meridian:evening] run for trading day ${closeDate}`);

  const unsettled = listUnsettledForDate(closeDate);
  if (unsettled.length === 0) {
    console.log('[meridian:evening] nothing to settle for today');
    return;
  }

  console.log(`[meridian:evening] settling ${unsettled.length} markets across ${new Set(unsettled.map((u) => u.ticker)).size} tickers`);
  const forceSettle = process.env.MERIDIAN_FORCE_SETTLE === 'true';

  const signer = await getOracleSigner();
  const settleFn: SettleFn = async (row, close) => {
    const r = await settleOne(signer, row as any, close);
    if (!r) return false;
    markSettled({ collectionId: row.collection_id, outcome: r.outcome, settlementPrice: close });
    return true;
  };

  // Retry the fetch+settle for any still-unsettled market every
  // MERIDIAN_SETTLE_RETRY_INTERVAL_MS, up to MERIDIAN_SETTLE_RETRY_WINDOW_MS.
  // Re-fetching each pass lets a not-yet-posted close / transient divergence
  // resolve on its own (the official close print typically lands a few minutes
  // after 4 PM ET). Window <= 0 ⇒ a single pass (kill-switch / tests).
  const intervalMs = Number(process.env.MERIDIAN_SETTLE_RETRY_INTERVAL_MS ?? 30_000);
  const windowMs = Number(process.env.MERIDIAN_SETTLE_RETRY_WINDOW_MS ?? 900_000);
  let outstanding = unsettled;
  const { remaining, attempts } = await retryUntil(
    async (attempt) => {
      const tickers = [...new Set(outstanding.map((o) => o.ticker as Ticker))];
      const closes = await fetchCloses(tickers, forceSettle, fetchPriceQuote);
      outstanding = await settlePass(outstanding, closes, settleFn);
      if (outstanding.length > 0) {
        console.warn(`[meridian:evening] pass ${attempt}: ${outstanding.length}/${unsettled.length} still unsettled`);
      }
      return outstanding;
    },
    { intervalMs, windowMs, onAttempt: (a, ms) => console.log(`[meridian:evening] retrying in ${Math.round(intervalMs / 1000)}s (~${Math.round(ms / 1000)}s of window left, after pass ${a})`) },
  );

  const settled = unsettled.length - remaining.length;
  console.log(`[meridian:evening] done: ${settled} settled, ${remaining.length} unsettled after ${attempts} pass(es) (of ${unsettled.length})`);
  if (remaining.length > 0) {
    const lines = remaining.map((r) => `• ${r.ticker} ≥ $${r.strike} (#${r.collection_id})`).join('\n');
    await sendAlert(
      `Meridian settlement needs manual override — ${remaining.length} unsettled (${closeDate})`,
      `These markets did not settle after ${attempts} pass(es) over the retry window. The oracle was unavailable, sources diverged, or the session never closed. Settle manually (MERIDIAN_FORCE_SETTLE=true) or via the admin override:\n${lines}`,
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[meridian:evening] uncaught:', e);
  process.exit(2);
});
