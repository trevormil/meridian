import {
  buildPredictionMarketDepositMsg,
  buildPredictionMarketBuyIntent,
  buildPredictionMarketSellIntent,
  UintRangeArray,
} from 'bitbadges';
import { env } from '../env.js';
import { getDb } from '../db/index.js';
import { listen, channel } from '../pubsub.js';
import { getBotSigner, botBroadcast } from './signer.js';
import { fetchIntentsForAddress } from '../chain/intents.js';
import { syncIntentsForOwner } from '../db/intents.js';

/**
 * SEED_MODE liquidity seeder.
 *
 * Posts a monotone price × quantity GRID of limit orders so the always-on
 * arbitrage bot has matching sizes available for most user orders. The chain
 * doesn't allow partial fills (`allowAmountScaling: false` on every intent),
 * so the bot can only cross when there's an EXACT bid.qty ≡ ask.qty match —
 * the multi-quantity ladder is what makes that match likely for a typical
 * user order of 1, 5, or 10 tokens.
 *
 * Ladder shape (per market, per side YES/NO):
 *   Sell at [0.55, 0.60, ..., 0.95] × quantities [1, 5, 10]
 *   Buy  at [0.05, 0.10, ..., 0.45] × quantities [1, 5, 10]
 *
 * Monotone = no internal arbitrage exists (max buy_YES + buy_NO = 0.90 < 1,
 * min sell_YES + sell_NO = 1.10 > 1), so the arb worker won't drain the seed.
 *
 * Bot capital per market:
 *   - sell side: (1+5+10) × 9 prices = 144 YES + 144 NO needed → 144 USDC deposit
 *   - buy side: 144 USDC equivalent × sum(buy prices) = 144 × 2.25 = 324 USDC * 2 sides ≈ 280 USDC
 * Total: ~425 USDC per market. With 100M USDC bot balance, supports >200k markets.
 */

const QUANTITIES: readonly bigint[] = [1_000_000n, 5_000_000n, 10_000_000n] as const;
const SELL_PRICES = [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95] as const;
const BUY_PRICES = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45] as const;
const TOTAL_TOKEN_QTY = QUANTITIES.reduce((a, b) => a + b, 0n); // 16 per sell-price-point
const FOREVER_END_MS = BigInt('9999999999999');

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function shouldSeed(): boolean {
  return (process.env.SEED_MODE ?? '').toLowerCase() === 'true';
}

/**
 * In-process lock — `runOnce` is async and can run for a while (each market
 * is two sequential txs that wait for commit). If markets-channel events
 * arrive while we're mid-loop, we don't re-enter; we just remember that
 * another sweep is needed and trigger it when the current one returns.
 *
 * Without this, the morning script's burst of 45 markets fires 45 listen
 * callbacks within seconds, but only the first one wins (LIMIT 10 candidates,
 * mark in_progress), and the subsequent calls all see the same first batch.
 * Net effect: only the first few seed.
 */
let _runInFlight = false;
let _runPending = false;

export function startSeeder(): () => void {
  if (!shouldSeed()) {
    console.log('[seeder] SEED_MODE not set — disabled');
    return () => {};
  }
  ensureSeedStatusColumn();

  // Listen for new collection inserts via the `markets` channel.
  const off = listen(channel.markets(), () => {
    void triggerRun();
  });

  // Belt-and-suspenders: periodic sweep (every 20s) so even if every
  // listener event was missed (HMR reload, transient pubsub hiccup), the
  // backlog drains within a tick.
  const interval = setInterval(() => void triggerRun(), 20_000);

  // Initial sweep at startup so pre-existing unseeded markets get hit.
  void triggerRun();

  return () => {
    off();
    clearInterval(interval);
  };
}

async function triggerRun(): Promise<void> {
  if (_runInFlight) {
    // Another sweep is mid-loop; remember to do one more after it finishes
    // so we never lose markets that got inserted while we were busy.
    _runPending = true;
    return;
  }
  _runInFlight = true;
  try {
    do {
      _runPending = false;
      await runOnce();
    } while (_runPending);
  } finally {
    _runInFlight = false;
  }
}

function ensureSeedStatusColumn(): void {
  const cols = getDb().prepare("PRAGMA table_info(markets)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'seed_status')) {
    getDb().exec("ALTER TABLE markets ADD COLUMN seed_status TEXT");
  }
}

async function runOnce(): Promise<void> {
  if (!shouldSeed()) return;
  const signer = await getBotSigner();
  if (!signer) {
    console.warn('[seeder] bot fixture missing — disabled');
    return;
  }

  // No LIMIT — process every unseeded active market in a single sweep so
  // morning script bursts don't get capped at 10 markets. Each seed is a
  // sequential 2-tx flow with commit waits, so this paces itself naturally.
  // Retry anything not yet fully 'seeded' — including 'failed' (transient
  // errors like the gas revert) and 'in_progress' (a seed interrupted by a
  // restart). Without this a single hiccup stranded a market forever. The
  // reentrance lock prevents the same market being double-processed across
  // overlapping sweeps; a market that genuinely seeds flips to 'seeded' and
  // drops out of this set.
  const candidates = getDb()
    .prepare(
      `SELECT collection_id, raw_collection_json FROM markets
       WHERE (seed_status IS NULL OR seed_status <> 'seeded')
         AND status = 'active'
       ORDER BY CAST(collection_id AS INTEGER) ASC`,
    )
    .all() as Array<{ collection_id: string; raw_collection_json: string }>;

  for (const m of candidates) {
    try {
      await seedOne(signer, m.collection_id, m.raw_collection_json);
    } catch (e) {
      console.warn(`[seeder] #${m.collection_id} failed:`, (e as Error).message);
      mark(m.collection_id, 'failed');
    }
  }
}

async function seedOne(
  signer: { client: any; address: string },
  collectionId: string,
  rawJson: string,
): Promise<void> {
  let collection: any;
  try {
    collection = JSON.parse(rawJson);
  } catch {
    throw new Error('bad raw_collection_json');
  }
  const mintApprovalId = findApprovalId(collection, 'pm-mint-');
  if (!mintApprovalId) throw new Error('no pm-mint approval — not a prediction market');

  mark(collectionId, 'in_progress');

  // STEP 1: deposit USDC to mint the YES/NO tokens we'll need to back sell orders.
  // For each of the 9 sell-price points we'll post intents at each of |QUANTITIES|
  // sizes — so total token need per side is sum(QUANTITIES) × prices.
  const depositAmount = TOTAL_TOKEN_QTY * BigInt(SELL_PRICES.length);
  const depositMsg = buildPredictionMarketDepositMsg(
    signer.address,
    collectionId,
    depositAmount,
    mintApprovalId,
  );
  const dep = await botBroadcast(signer, [depositMsg], `seed:deposit(#${collectionId},${depositAmount})`);
  if (!dep || dep.code !== 0) throw new Error('deposit step failed');

  // STEP 2: post all limit orders in a single tx. Chain accepts an arbitrary
  // array of messages per tx and runs them atomically; if any one approval
  // setup fails, the whole batch reverts cleanly. We chunk by ~50 to stay
  // under the chain's per-tx gas ceiling.
  const all: unknown[] = [];
  for (const p of SELL_PRICES) {
    for (const q of QUANTITIES) {
      all.push(makeSellIntent(signer.address, collectionId, 'yes', q, p));
      all.push(makeSellIntent(signer.address, collectionId, 'no', q, p));
    }
  }
  for (const p of BUY_PRICES) {
    for (const q of QUANTITIES) {
      all.push(makeBuyIntent(signer.address, collectionId, 'yes', q, p));
      all.push(makeBuyIntent(signer.address, collectionId, 'no', q, p));
    }
  }
  // The chain's approval-overlap check (UniversalRemoveOverlaps) costs gas
  // ~QUADRATICALLY in the number of approvals added per tx: 35-order batch
  // ≈ 492k gas, 50-order ≈ 2M+ (blew the 2M limit). So keep batches small —
  // 20 orders ≈ ~200k gas, well under the 2M client limit. 108 → 6 batches.
  const CHUNK = 20;
  for (let i = 0; i < all.length; i += CHUNK) {
    const slice = all.slice(i, i + CHUNK);
    const ord = await botBroadcast(
      signer,
      slice,
      `seed:orders(#${collectionId} ${i + 1}-${i + slice.length}/${all.length})`,
    );
    if (!ord || ord.code !== 0) throw new Error(`orders step failed at slice ${i}`);
  }
  const totalIntents = all.length;

  // The live tx-watcher should have picked up the bot's address from the
  // approval-set events and refreshed its intents — but tx events sometimes
  // miss in the WS stream. Force an explicit sync so the order book and the
  // arbitrage bot both see the freshly-posted ladder immediately.
  try {
    const live = await fetchIntentsForAddress(collectionId, signer.address);
    syncIntentsForOwner(signer.address, collectionId, live);
  } catch (e) {
    console.warn(`[seeder] #${collectionId} post-broadcast intent sync failed:`, (e as Error).message);
  }

  mark(collectionId, 'seeded');
  console.log(
    `[seeder] #${collectionId} seeded — ${totalIntents} intents (${SELL_PRICES.length} prices × ${QUANTITIES.length} sizes × 2 sides × 2 directions)`,
  );
}

function makeBuyIntent(address: string, collectionId: string, side: 'yes' | 'no', tokenAmount: bigint, price: number) {
  const tokenId = side === 'yes' ? 1n : 2n;
  const paymentAmount = BigInt(Math.round(Number(tokenAmount) * price));
  const approvalId = randomId(`seed-buy-${side}-${Math.round(price * 100)}`);
  const approval = buildPredictionMarketBuyIntent({
    address,
    collectionId,
    tokenId,
    tokenAmount,
    paymentDenom: env.usdcDenom,
    paymentAmount,
    transferTimes: UintRangeArray.From([{ start: 1n, end: FOREVER_END_MS }]),
    approvalId,
  });
  return {
    typeUrl: '/tokenization.MsgSetIncomingApproval',
    value: { creator: address, collectionId, approval },
  };
}

function makeSellIntent(address: string, collectionId: string, side: 'yes' | 'no', tokenAmount: bigint, price: number) {
  const tokenId = side === 'yes' ? 1n : 2n;
  const paymentAmount = BigInt(Math.round(Number(tokenAmount) * price));
  const approvalId = randomId(`seed-sell-${side}-${Math.round(price * 100)}`);
  const approval = buildPredictionMarketSellIntent({
    address,
    collectionId,
    tokenId,
    tokenAmount,
    paymentDenom: env.usdcDenom,
    paymentAmount,
    transferTimes: UintRangeArray.From([{ start: 1n, end: FOREVER_END_MS }]),
    approvalId,
  });
  return {
    typeUrl: '/tokenization.MsgSetOutgoingApproval',
    value: { creator: address, collectionId, approval },
  };
}

function findApprovalId(collection: any, prefix: string): string | undefined {
  for (const a of collection?.collectionApprovals ?? []) {
    if (typeof a.approvalId === 'string' && a.approvalId.startsWith(prefix)) return a.approvalId;
  }
  return undefined;
}

function mark(collectionId: string, status: 'pending' | 'in_progress' | 'seeded' | 'failed'): void {
  getDb()
    .prepare('UPDATE markets SET seed_status = ? WHERE collection_id = ?')
    .run(status, collectionId);
}
