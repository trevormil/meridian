import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { fetchIntentsForAddress } from '../chain/intents.js';
import { upsertIntents, syncIntentsForOwner, listIntentsByCollection, listIntentsByOwner } from '../db/intents.js';
import { bootstrapScan } from '../workers/bootstrap.js';
import { searchHistoricalFills, searchHistoricalVotes, impliedYesPrice } from '../chain/events.js';
import { recordCandle, updateMarketPrice } from '../db/candles.js';
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
    for (const f of fillEvents) {
      const price = impliedYesPrice(f);
      if (price === null) continue;
      recordCandle(id, price, 1 - price);
      updateMarketPrice(id, price, 1 - price);
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
  const tf = (c.req.query('timeframe') ?? '1h') as '10m' | '1h' | '1d';
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
