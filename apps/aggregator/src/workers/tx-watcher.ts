import { Tendermint37Client } from '@cosmjs/tendermint-rpc';
import { convertToBitBadgesAddress } from 'bitbadges';
import { env } from '../env.js';
import { getDb } from '../db/index.js';
import { getCollection } from '../chain/lcd.js';
import { fetchIntentsForAddress } from '../chain/intents.js';
import { syncIntentsForOwner } from '../db/intents.js';
import { upsertMarket } from './bootstrap.js';
import { recordCandle, updateMarketPrice } from '../db/candles.js';
import {
  parseUsedApprovalDetails,
  parseCastVotes,
  impliedYesPrice,
  searchHistoricalFills,
  searchHistoricalVotes,
  type UsedApprovalDetails,
} from '../chain/events.js';
import { recordVote } from '../db/votes.js';
import { refreshMarketStatusFromVotes } from './status-updater.js';
import { publish, channel } from '../pubsub.js';
import { snapshotFills } from '../snapshots.js';

/**
 * Tx watcher with two paths:
 *
 *   1. **Live subscribeTx** — Tendermint pushes every new tx's events as it
 *      lands. We parse `usedApprovalDetails` events → derive price + emit a
 *      candle. We also extract bb1 addresses → refresh their intents so new
 *      posts + cancels land in the DB immediately.
 *
 *   2. **Startup backfill** — for every known market, query Tendermint RPC's
 *      `/tx_search?query=usedApprovalDetails.collectionId='N'` to walk every
 *      historical fill on that market. This catches everything that happened
 *      pre-aggregator (or between resets).
 *
 * The price logic mirrors the indexer (handleTransfers.ts:getDetailsFromDoc):
 *   price = sum(non-fee coinTransfers.Amount) / sum(balances.amount)
 */
export async function startTxWatcher(): Promise<() => void> {
  // Re-run backfill on a slow loop so it sweeps up:
  //   - fills that happened before bootstrap had indexed the market
  //   - any new markets discovered later
  // recordCandle is idempotent (upsert on bucket_ts), so this is safe to repeat.
  backfillHistoricalFills().catch((e) => console.error('[tx-watcher] backfill:', e));
  const backfillTimer = setInterval(() => {
    backfillHistoricalFills().catch((e) => console.error('[tx-watcher] backfill:', e));
  }, 30_000);

  const client = await Tendermint37Client.connect(env.tendermintWsUrl);
  console.log('[tx-watcher] subscribed to live tx events at', env.tendermintWsUrl);
  const stream = client.subscribeTx();
  const sub = stream.subscribe({
    next: (evt: unknown) => {
      handleLiveTx(evt).catch((e) => console.error('[tx-watcher]', e));
    },
    error: (err) => console.error('[tx-watcher] stream error:', err),
    complete: () => console.log('[tx-watcher] stream complete'),
  });
  return () => {
    clearInterval(backfillTimer);
    sub.unsubscribe();
    client.disconnect();
  };
}

/**
 * Process a live tx event from Tendermint subscribeTx. The cosmjs payload
 * shape is `{ tx, hash, height, events, result }` — events is the array we
 * want; result may also carry events depending on the version.
 */
async function handleLiveTx(evt: unknown): Promise<void> {
  const e = evt as { events?: any[]; result?: { events?: any[] } };
  const events = e.events ?? e.result?.events ?? [];
  if (!Array.isArray(events) || !events.length) return;

  await ingestEvents(events);
}

/**
 * Common processing for a list of chain events. (1) Record any fill-derived
 * price candle, (2) refresh any address mentioned so its intents stay current.
 */
async function ingestEvents(events: any[]): Promise<void> {
  // 1) Fill candles from usedApprovalDetails.
  const fills = parseUsedApprovalDetails(events);
  for (const f of fills) {
    if (!isKnownMarket(f.collectionId)) continue;
    recordFill(f);
  }

  // 2) Votes — tally locally + recompute status. The chain's REST /get_votes
  // endpoint can't be hit with empty `approverAddress` (grpc-gateway path),
  // so we mirror the chain's tally from the tx event stream instead.
  const votes = parseCastVotes(events);
  const touched = new Set<string>();
  for (const v of votes) {
    if (!isKnownMarket(v.collectionId)) continue;
    recordVote(v);
    touched.add(v.collectionId);
  }
  for (const cid of touched) refreshMarketStatusFromVotes(cid);

  // 3) Address-driven intent refresh — catches new posts and cancels for
  // wallets that aren't yet in our DB.
  const addresses = extractAddresses(events);
  if (addresses.size > 0) await refreshIntentsFor(addresses);

  // 4) Newly-created markets — covers BOTH Cosmos-signed Msg... and
  // EVM-signed MsgEthereumTx wrapping a precompile call. The chain emits the
  // SAME `message` (and `indexer`) events for both paths with attributes
  // {module: 'tokenization', msg_type: 'universal_update_collection', collection_id}.
  // Without this, a brand-new collection only gets picked up on the 15s
  // bootstrap loop — wiring it inline makes it appear on the FE in ~1s.
  const newCollectionIds = extractNewCollectionIds(events);
  for (const cid of newCollectionIds) {
    if (isKnownMarket(cid)) continue;
    try {
      const c = await getCollection(cid);
      if (c) upsertMarket(c); // upsertMarket no-ops for non-prediction-markets via bootstrap's own filter on next sweep
    } catch {
      // transient — bootstrap loop will catch it on the next 15s sweep
    }
  }
}

/**
 * Pull `collection_id` out of any `message` / `indexer` event whose
 * `msg_type` indicates a collection mutation. Covers create + universal
 * update + delete on both Cosmos and EVM-wrapped paths.
 */
function extractNewCollectionIds(events: any[]): Set<string> {
  const out = new Set<string>();
  const MUTATING = new Set([
    'universal_update_collection',
    'create_collection',
    'update_collection',
    'set_collection_metadata',
    'set_collection_approvals',
    'set_standards',
  ]);
  for (const e of events ?? []) {
    if (e.type !== 'message' && e.type !== 'indexer') continue;
    const attrs = Object.fromEntries((e.attributes ?? []).map((a: any) => [a.key, a.value]));
    if (attrs.module !== 'tokenization') continue;
    if (!MUTATING.has(attrs.msg_type)) continue;
    const cid = attrs.collection_id || attrs.collectionId;
    if (cid && /^\d+$/.test(String(cid))) out.add(String(cid));
  }
  return out;
}

/** Cosmos zero-pubkey burn address (the bech32 checksum is computed from
 *  all-zero bytes — note the `s7gvmv` tail). Tokens sent here are burned;
 *  used by the prediction-market redeem flow to convert winning YES/NO
 *  tokens to USDC. Fills where `to == BURN` are settlement redemptions,
 *  not trades, and must NOT influence the price chart or count as volume. */
const BURN_ADDRESS = 'bb1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqs7gvmv';

function isRedemptionApproval(approvalId: string): boolean {
  // Mint, settle, and pre-settlement-redeem approvals all carry side-effects
  // on user balances but aren't price discovery. Their approvalIds start
  // with these prefixes (see SDK builder presets/prediction-market.ts).
  return (
    approvalId.startsWith('pm-mint-') ||
    approvalId.startsWith('pm-redeem-') ||
    approvalId.startsWith('pm-settle-')
  );
}

function recordFill(f: UsedApprovalDetails): void {
  const tokenStart = f.balances[0]?.tokenIds?.[0]?.start;
  const side = tokenStart === '1' ? 'yes' : 'no';
  const tokenAmount = f.balances[0]?.amount ?? '0';
  const usdc = f.coinTransfers.find((c) => !c.IsProtocolFee);
  const coinAmount = usdc?.Amount ?? '0';
  const approvalUsed = f.approvalsUsed.find((a) => a.ApprovalLevel !== 'collection') ?? f.approvalsUsed[0];

  // Skip redemptions + mints entirely — they're balance plumbing, not trades.
  // Detection: either the recipient is the burn sink, OR the approval used
  // is one of the protocol approvals (mint / pre-settle / settle paths).
  const isRedemption =
    f.to === BURN_ADDRESS || (approvalUsed && isRedemptionApproval(approvalUsed.ApprovalId));
  if (isRedemption) return;

  const price = impliedYesPrice(f);
  if (price === null) return; // mint / pair-redeem / fee-only — skip

  // Materialize the fill row FIRST; only emit candles + publish if it's new.
  // Backfill replays already INSERT OR IGNORE here, so for a known fill the
  // PK collision means changes=0 and we skip the noisy candle re-write +
  // log line + ws push.
  if (!approvalUsed) return;
  const insertRes = getDb()
    .prepare(
      `INSERT OR IGNORE INTO fills
         (collection_id, approval_id, approver_address, ts, side, token_amount, coin_amount, price, from_address, to_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      f.collectionId,
      approvalUsed.ApprovalId,
      approvalUsed.ApproverAddress,
      Date.now(),
      side,
      tokenAmount,
      coinAmount,
      price,
      f.from,
      f.to,
    );
  if (insertRes.changes === 0) {
    // Already seen this fill — silent no-op (avoids the per-30s backfill spam).
    return;
  }

  // New fill: write candle, bump volume, publish, log.
  recordCandle(f.collectionId, price, 1 - price);
  updateMarketPrice(f.collectionId, price, 1 - price);
  getDb()
    .prepare(
      `UPDATE markets
         SET total_volume = CAST(CAST(total_volume AS INTEGER) + CAST(? AS INTEGER) AS TEXT)
       WHERE collection_id = ?`,
    )
    .run(coinAmount, f.collectionId);
  publish(channel.fills(f.collectionId), snapshotFills(f.collectionId));

  console.log(
    `[tx-watcher] fill #${f.collectionId} ${side.toUpperCase()} ${tokenAmount} → YES=${price.toFixed(4)} (${f.from.slice(0, 10)}…→${f.to.slice(0, 10)}…)`,
  );
}

function isKnownMarket(collectionId: string): boolean {
  const r = getDb().prepare('SELECT 1 FROM markets WHERE collection_id = ?').get(collectionId);
  return !!r;
}

function extractAddresses(events: any[]): Set<string> {
  // Scan attribute values for both bb1 (cosmos) and 0x (EVM) addresses. EVM
  // addresses get converted to their bb1 form via the SDK so chain-side
  // lookups (intents, balances) work — all on-chain accounting is bb1-keyed.
  const out = new Set<string>();
  const ethAddrs = new Set<string>();
  for (const e of events ?? []) {
    for (const a of e.attributes ?? []) {
      const v = typeof a.value === 'string' ? a.value.replace(/^"|"$/g, '') : '';
      if (v.startsWith('bb1') && v.length >= 30) out.add(v);
      else if (/^0x[0-9a-fA-F]{40}$/.test(v)) ethAddrs.add(v);
    }
  }
  for (const eth of ethAddrs) {
    try {
      out.add(convertToBitBadgesAddress(eth));
    } catch {
      // unparseable — skip
    }
  }
  return out;
}

async function refreshIntentsFor(addresses: Set<string>): Promise<void> {
  const markets = getDb().prepare('SELECT collection_id FROM markets').all() as Array<{ collection_id: string }>;
  if (!markets.length) return;
  for (const addr of addresses) {
    for (const m of markets) {
      try {
        const live = await fetchIntentsForAddress(m.collection_id, addr);
        // syncIntentsForOwner upserts current chain state + flips disappeared
        // intents to used=1. We intentionally DO NOT emit a price candle from
        // the disappearance — cancels look identical to fills here, and the
        // usedApprovalDetails event (above) is the source of truth for trades.
        syncIntentsForOwner(addr, m.collection_id, live);
      } catch {
        // address may not have a balance store on this collection — ignore
      }
    }
  }
}

/**
 * Walk every known market's historical fill events via Tendermint RPC. Idempotent:
 * `recordCandle` is upsert-keyed by `(collection_id, timeframe, bucket_ts)`
 * so re-running just refreshes the same candle.
 */
async function backfillHistoricalFills(): Promise<void> {
  const markets = getDb().prepare('SELECT collection_id FROM markets').all() as Array<{ collection_id: string }>;
  if (!markets.length) return;
  let fillTotal = 0;
  let voteTotal = 0;
  for (const m of markets) {
    try {
      const fills = await searchHistoricalFills(m.collection_id, 200);
      for (const f of fills) recordFill(f);
      fillTotal += fills.length;
    } catch (e) {
      console.warn(`[tx-watcher] fill backfill failed for #${m.collection_id}:`, (e as Error).message);
    }
    try {
      const votes = await searchHistoricalVotes(m.collection_id, 200);
      for (const v of votes) recordVote(v);
      if (votes.length > 0) refreshMarketStatusFromVotes(m.collection_id);
      voteTotal += votes.length;
    } catch (e) {
      console.warn(`[tx-watcher] vote backfill failed for #${m.collection_id}:`, (e as Error).message);
    }
  }
  console.log(`[tx-watcher] backfill: ${fillTotal} fills, ${voteTotal} votes across ${markets.length} markets`);
}
