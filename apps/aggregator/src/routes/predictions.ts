import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { getBalance, getBankBalances, sumYesNo } from '../chain/lcd.js';
import { fetchIntentsForAddress } from '../chain/intents.js';
import { upsertIntents, syncIntentsForOwner, listIntentsByCollection, listIntentsByOwner } from '../db/intents.js';
import { bootstrapScan } from '../workers/bootstrap.js';
import { searchHistoricalFills, searchHistoricalVotes } from '../chain/events.js';
import { recordFill } from '../workers/tx-watcher.js';
import { recordVote } from '../db/votes.js';
import { refreshMarketStatusFromVotes } from '../workers/status-updater.js';
import { snapshotFills } from '../snapshots.js';

export const predictions = new Hono();

interface MarketRow {
  collection_id: string;
  metadata_uri: string | null;
  name: string | null;
  description: string | null;
  image: string | null;
  verifier_address: string | null;
  deposit_denom: string | null;
  deposit_amount: string | null;
  pool_id: string | null;
  status: string;
  yes_price: number;
  no_price: number;
  total_deposited: string;
  resolution_date: number | null;
}

function serializeMarket(r: MarketRow): unknown {
  return {
    collectionId: r.collection_id,
    metadataUri: r.metadata_uri,
    name: r.name,
    description: r.description,
    image: r.image,
    verifierAddress: r.verifier_address,
    depositDenom: r.deposit_denom,
    depositAmount: r.deposit_amount,
    poolId: r.pool_id,
    status: r.status,
    yesPrice: r.yes_price,
    noPrice: r.no_price,
    totalDeposited: r.total_deposited,
    totalVolume: (r as MarketRow & { total_volume?: string }).total_volume ?? '0',
    resolutionDate: r.resolution_date,
  };
}

predictions.get('/predictions', (c) => {
  const rows = getDb().prepare('SELECT * FROM markets ORDER BY created_at DESC LIMIT 100').all() as MarketRow[];
  // The WS pushes live updates; this REST list is only the cold-load seed, so
  // a few seconds of staleness is fine and lets the browser dedupe rapid hits.
  c.header('cache-control', 'public, max-age=5');
  return c.json({ predictions: rows.map(serializeMarket) });
});

predictions.post('/refresh', async (c) => {
  const result = await bootstrapScan();
  return c.json({ ok: true, ...result });
});

/**
 * Force a synchronous re-scan of all fill + vote events for one collection.
 * Used by the e2e suite (and FE polling) to avoid waiting on the 30s backfill
 * cycle or the live subscribeTx latency after a known mutation. Returns the
 * counts so the caller can sanity-check.
 */
predictions.post('/predictions/:collectionId/refresh-fills', async (c) => {
  const id = c.req.param('collectionId');
  let fills = 0;
  let votes = 0;
  try {
    const fillEvents = await searchHistoricalFills(id, 200);
    // Use the same recordFill path as the live watcher so a rescan populates
    // the fills/activity table + volume (not just price/candles) and is
    // idempotent — previously this lighter path left the Activity feed empty.
    for (const f of fillEvents) {
      recordFill(f);
      fills++;
    }
  } catch (e) {
    return c.json({ error: 'fill_scan_failed', detail: (e as Error).message }, 500);
  }
  try {
    const voteEvents = await searchHistoricalVotes(id, 200);
    for (const v of voteEvents) {
      recordVote(v);
      votes++;
    }
    if (votes > 0) refreshMarketStatusFromVotes(id);
  } catch (e) {
    return c.json({ error: 'vote_scan_failed', detail: (e as Error).message }, 500);
  }
  return c.json({ ok: true, fills, votes });
});

/**
 * Batch sparkline endpoint — one request returns compact YES-price series for
 * many markets. Backs the trend glance on browse market cards: a 45-card page
 * fetches ALL sparklines in a single round-trip (the FE coalesces per-card
 * asks into one call) instead of 45 separate /prices requests.
 *
 *   GET /predictions/sparklines?ids=1,2,3&timeframe=10m&points=24
 *   → { sparklines: { "1": [0.50, 0.52, …], … } }
 *
 * MUST be registered before `/predictions/:collectionId` so the static
 * "sparklines" segment isn't captured as a collection id. Only the YES close
 * per bucket is returned (no OHLC, no NO leg), capped to the most-recent
 * `points` buckets — keeps the payload tiny.
 */
predictions.get('/predictions/sparklines', (c) => {
  const idsParam = c.req.query('ids') ?? '';
  const tf = (c.req.query('timeframe') ?? '10m') as '1m' | '10m' | '1h' | '1d';
  const points = Math.min(60, Math.max(2, Number(c.req.query('points') ?? '24')));
  const ids = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, 100); // cap fan-out
  if (ids.length === 0) return c.json({ sparklines: {} });

  const db = getDb();
  // Most-recent `points` buckets per id, returned oldest→newest. One prepared
  // statement reused across ids (cheap; each is an indexed range scan).
  const stmt = db.prepare(
    `SELECT yes_price FROM (
       SELECT ts, yes_price FROM price_history
       WHERE collection_id = ? AND timeframe = ?
       ORDER BY ts DESC LIMIT ?
     ) ORDER BY ts ASC`,
  );
  const sparklines: Record<string, number[]> = {};
  for (const id of ids) {
    const rows = stmt.all(id, tf, points) as Array<{ yes_price: number }>;
    sparklines[id] = rows.map((r) => r.yes_price);
  }
  // Short cache — sparklines tolerate ~15s staleness; lets the browser dedupe
  // rapid re-requests during scroll.
  c.header('cache-control', 'public, max-age=15');
  return c.json({ sparklines });
});

/**
 * Positions for an address — YES/NO holdings across every market + the USDC
 * bank balance, in ONE response. Replaces the FE firing ~45 per-market chain
 * queries from the browser (over the internet, through Caddy): we run those
 * queries server-side (localhost→chain is fast + parallel) and return in a
 * single response.
 *
 * NOT cached — always a live chain read. The FE only calls this on mount + on
 * tx-confirm (not in a hot loop), so the dedup a cache would buy isn't worth
 * any staleness: a position must always reflect the latest committed block
 * (e.g. immediately after a deposit / fill / redeem). no-store keeps the
 * browser from holding a copy too.
 *
 * MUST precede /predictions/:collectionId so "positions" isn't captured as id.
 *
 *   GET /predictions/positions/:address
 *   → { positions: [{ collectionId, yes, no }], usdc }
 */
predictions.get('/predictions/positions/:address', async (c) => {
  const address = c.req.param('address');
  if (!/^bb1[0-9a-z]{38,}$/.test(address)) return c.json({ error: 'bad_address' }, 400);

  // Narrow to ONLY the markets this address has touched (from the
  // address_collections index) — a single balance query is ~0.9s on this
  // node, so scanning all ~90 markets would take ~7s even for an empty
  // portfolio. A normal holder has touched a handful → sub-second. The
  // balances are still read LIVE per market, so they're never stale.
  const touched = getDb()
    .prepare('SELECT collection_id FROM address_collections WHERE address = ?')
    .all(address) as Array<{ collection_id: string }>;
  const denomRow = getDb()
    .prepare('SELECT deposit_denom FROM markets ORDER BY created_at DESC LIMIT 1')
    .get() as { deposit_denom: string | null } | undefined;

  // Fire the (narrow) balance reads + the bank query in parallel, live.
  const [bank, stores] = await Promise.all([
    getBankBalances(address),
    Promise.all(
      touched.map(async (m) => ({ id: m.collection_id, store: await getBalance(m.collection_id, address) })),
    ),
  ]);

  const positions = stores
    .map(({ id, store }) => {
      const { yes, no } = sumYesNo(store);
      return { collectionId: id, yes: yes.toString(), no: no.toString() };
    })
    .filter((p) => p.yes !== '0' || p.no !== '0');

  const usdcDenom = denomRow?.deposit_denom ?? 'ustake';
  const usdc = bank.find((b) => b.denom === usdcDenom)?.amount ?? '0';

  c.header('cache-control', 'no-store');
  return c.json({ positions, usdc });
});

predictions.get('/predictions/:collectionId', (c) => {
  const id = c.req.param('collectionId');
  const row = getDb().prepare('SELECT * FROM markets WHERE collection_id = ?').get(id) as MarketRow | undefined;
  if (!row) return c.json({ error: 'not_found' }, 404);
  const raw = getDb()
    .prepare('SELECT raw_collection_json FROM markets WHERE collection_id = ?')
    .get(id) as { raw_collection_json: string };
  return c.json({ prediction: serializeMarket(row), collection: raw?.raw_collection_json ? JSON.parse(raw.raw_collection_json) : null });
});

predictions.get('/predictions/:collectionId/prices', (c) => {
  const id = c.req.param('collectionId');
  const tf = (c.req.query('timeframe') ?? '1h') as '1m' | '10m' | '1h' | '1d';
  const rows = getDb()
    .prepare(
      'SELECT ts, yes_price, no_price, open, high, low, close FROM price_history WHERE collection_id = ? AND timeframe = ? ORDER BY ts ASC',
    )
    .all(id, tf) as Array<{ ts: number; yes_price: number; no_price: number }>;
  return c.json({
    prices: {
      yes: rows.map((r) => ({ time: r.ts, value: r.yes_price })),
      no: rows.map((r) => ({ time: r.ts, value: r.no_price })),
    },
  });
});

/** Fill (trade) activity per market — most recent first. Backs the Activity tab. */
predictions.get('/predictions/:collectionId/fills', (c) => {
  const id = c.req.param('collectionId');
  const limit = Math.min(500, Number(c.req.query('limit') ?? '100'));
  return c.json({ fills: snapshotFills(id, limit) });
});

predictions.get('/intents', async (c) => {
  const collectionId = c.req.query('collectionId');
  if (!collectionId) return c.json({ error: 'collectionId_required' }, 400);
  const rows = listIntentsByCollection(collectionId, { activeOnly: c.req.query('includeAll') !== 'true' });
  return c.json({ intents: rows.map(serializeIntent) });
});

predictions.get('/intents/:address', async (c) => {
  const address = c.req.param('address');
  const collectionId = c.req.query('collectionId') ?? undefined;
  const includeAll = c.req.query('includeAll') === 'true';

  // Live refresh from chain before returning. We use the sync (not upsert) path
  // so intents that have disappeared from chain (filled / cancelled / purged)
  // get marked used in the DB instead of lingering as "active" forever.
  if (collectionId) {
    try {
      const rows = await fetchIntentsForAddress(collectionId, address);
      syncIntentsForOwner(address, collectionId, rows);
    } catch (e) {
      console.warn('[intents] live refresh failed:', (e as Error).message);
    }
  }

  const rows = listIntentsByOwner(address, collectionId, { includeAll });
  return c.json({ intents: rows.map(serializeIntent) });
});

function serializeIntent(r: any) {
  // transferTimes are stored as MILLISECONDS (unix epoch) — chain convention.
  const nowMs = Date.now();
  const start: number | null = r.transfer_times_start;
  const end: number | null = r.transfer_times_end;
  // Treat near-max-uint64 (>= year 2200) as "no expiry".
  const FOREVER = 2_000_000_000_000_000;
  const expired = end !== null && end > 0 && end < FOREVER && nowMs > end;
  const isActive = !r.used && !expired;
  return {
    collectionId: r.collection_id,
    approvalLevel: r.approval_level,
    approverAddress: r.owner_address,
    ownerAddress: r.owner_address,
    approvalId: r.approval_id,
    payDenom: r.pay_denom,
    receiveDenom: r.receive_denom,
    payAmount: r.pay_amount,
    receiveAmount: r.receive_amount,
    transferTimes: { start, end },
    used: !!r.used,
    isActive,
    isPending: start !== null && start > 0 && start < FOREVER && nowMs < start,
    isExpired: expired,
  };
}
