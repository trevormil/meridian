import { buildPredictionMarketDepositMsg } from 'bitbadges';
import { getDb } from '../db/index.js';
import type { IntentDbRow } from '../db/intents.js';
import { getBotSigner, botBroadcast } from './signer.js';
import { searchHistoricalFills } from '../chain/events.js';
import { recordFill } from '../workers/tx-watcher.js';
import { recordCandle, updateMarketPrice } from '../db/candles.js';
import { publish, channel } from '../pubsub.js';
import { snapshotIntentsOwner, snapshotIntents } from '../snapshots.js';

/**
 * Demo market-maker bot (replaces the arbitrage bot).
 *
 * Every scan it finds any NON-bot open order priced in the [0.40, 0.60] band
 * and immediately takes the opposite side, so user orders fill instantly:
 *
 *   - user BUY  (incoming approval): the bot mints a YES+NO pair and SELLS the
 *     requested token to the user (keeps the other leg). e.g. a 55¢ YES buy →
 *     bot deposits, sells YES @55¢.
 *   - user SELL (outgoing approval): the bot BUYS the token from the user for
 *     USDC.
 *
 * The seed ladder lives entirely OUTSIDE this band (5–35¢ bids, 65–95¢ asks)
 * purely for visual depth, so the only orders the bot ever fills are real user
 * orders inside the band. No arbitrage, no order-crossing — just a counterparty
 * that always takes a fair-priced trade.
 */
// The chain→aggregator WS (subscribeNewBlock/Tx) hangs from inside the Docker
// container (host.docker.internal upgrade fails), so we drive the fill scan
// with a timer instead of a block subscription. Each scan is now a single
// indexed query for non-bot orders (see findAllFills) — ~cheap regardless of
// market count — so a 1s cadence keeps fills snappy without loading the loop.
const SCAN_INTERVAL_MS = 1_000;
const BAND_LO = 0.4;
const BAND_HI = 0.6;
// Skip absurdly large orders so a single fill can't drain the bot. Demo orders
// are a handful of tokens; this is ~1000 tokens.
const MAX_FILL_QTY = 1_000_000_000n;

const PM_FULL_OWNERSHIP = [{ start: '1', end: '18446744073709551615' }];

// ── per-order cooldown so a hopeless fill (already consumed, expired, etc.)
//    isn't retried every 3s ──
const COOLDOWN_MS = 30_000;
const cooldownUntil = new Map<string, number>();
function fillKey(c: FillCandidate): string {
  return `${c.collectionId}|${c.intent.owner_address}|${c.intent.approval_id}`;
}
function isCooling(c: FillCandidate): boolean {
  const t = cooldownUntil.get(fillKey(c));
  return t !== undefined && Date.now() < t;
}
function cooldown(c: FillCandidate, reason: string): void {
  cooldownUntil.set(fillKey(c), Date.now() + COOLDOWN_MS);
  console.log(`[mm] cooldown ${fillKey(c).slice(0, 48)}… (${reason})`);
}

type Intent = IntentDbRow;

interface FillCandidate {
  collectionId: string;
  intent: Intent;
  tokenId: 1 | 2;
  qty: bigint;
  price: number;
  side: 'buy' | 'sell';
}

function toBig(v: string | null | undefined): bigint {
  if (!v) return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

/** USDC-per-token price implied by an intent's pay/receive denoms + amounts. */
function intentPrice(i: Intent): number {
  const payTok = (i.pay_denom ?? '').startsWith('badgeslp:');
  const recvTok = (i.receive_denom ?? '').startsWith('badgeslp:');
  if (payTok === recvTok) return NaN; // both/neither token → not a price intent
  const tokenAmt = Number(payTok ? i.pay_amount : i.receive_amount);
  const coinAmt = Number(payTok ? i.receive_amount : i.pay_amount);
  if (tokenAmt <= 0) return NaN;
  return coinAmt / tokenAmt;
}

function tokenIdOf(i: Intent): 1 | 2 | null {
  const pay = i.pay_denom ?? '';
  const recv = i.receive_denom ?? '';
  const token = pay.startsWith('badgeslp:') ? pay : recv.startsWith('badgeslp:') ? recv : null;
  if (!token) return null;
  if (token.endsWith(':uyes')) return 1;
  if (token.endsWith(':uno')) return 2;
  return null;
}

// BUY = incoming approval (user receives token, pays USDC).
// SELL = outgoing approval (user gives token, receives USDC).
function isBuy(i: Intent): boolean {
  return i.approval_level === 'incoming';
}

/** Token count the intent governs: BUY → receive_amount, SELL → pay_amount. */
function tokenQty(i: Intent): bigint {
  const payIsTok = (i.pay_denom ?? '').startsWith('badgeslp:');
  return payIsTok ? toBig(i.pay_amount) : toBig(i.receive_amount);
}

function findApprovalIdForCollection(collectionId: string, prefix: string): string | undefined {
  const row = getDb()
    .prepare('SELECT raw_collection_json FROM markets WHERE collection_id = ?')
    .get(collectionId) as { raw_collection_json?: string } | undefined;
  if (!row?.raw_collection_json) return undefined;
  try {
    const c = JSON.parse(row.raw_collection_json);
    for (const a of c?.collectionApprovals ?? []) {
      if (typeof a.approvalId === 'string' && a.approvalId.startsWith(prefix)) return a.approvalId;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/** A single MsgTransferTokens that fills ONE user order, bot as counterparty. */
function buildFill(
  botAddress: string,
  collectionId: string,
  intent: Intent,
  tokenAmount: bigint,
  approvalLevel: 'incoming' | 'outgoing',
): unknown {
  const tokenId = tokenIdOf(intent);
  if (!tokenId) throw new Error('intent has no resolvable token id');
  const tokenIds = [{ start: String(tokenId), end: String(tokenId) }];
  const balances = [{ amount: tokenAmount.toString(), tokenIds, ownershipTimes: PM_FULL_OWNERSHIP }];
  const transfer =
    approvalLevel === 'incoming'
      ? { from: botAddress, toAddresses: [intent.owner_address] } // bot SENDS token to the buyer
      : { from: intent.owner_address, toAddresses: [botAddress] }; // bot RECEIVES token from the seller
  return {
    typeUrl: '/tokenization.MsgTransferTokens',
    value: {
      creator: botAddress,
      collectionId,
      transfers: [
        {
          ...transfer,
          balances,
          prioritizedApprovals: [
            {
              approvalId: intent.approval_id,
              approvalLevel,
              approverAddress: intent.owner_address,
              version: '0',
            },
          ],
          onlyCheckPrioritizedCollectionApprovals: false,
          onlyCheckPrioritizedOutgoingApprovals: approvalLevel === 'outgoing',
          onlyCheckPrioritizedIncomingApprovals: approvalLevel === 'incoming',
          memo: '',
        },
      ],
    },
  };
}

function findAllFills(botAddress: string): FillCandidate[] {
  // ONE indexed query for all active, NON-bot intents across every market.
  // The seeder owns ~108 intents per market (the visual ladder the bot never
  // fills), so excluding the bot in SQL turns what used to be a 100-query /
  // ~10k-row-per-scan sweep into the handful of real user orders — the only
  // orders this bot ever fills. (This is what was pinning the event loop.)
  const intents = getDb()
    .prepare('SELECT * FROM intents WHERE is_active = 1 AND owner_address != ?')
    .all(botAddress) as Intent[];
  if (intents.length === 0) return [];
  // Only fill orders on active markets — closed/resolved markets reject fills.
  const active = new Set(
    (
      getDb().prepare("SELECT collection_id FROM markets WHERE status = 'active'").all() as Array<{
        collection_id: string;
      }>
    ).map((m) => m.collection_id),
  );
  const out: FillCandidate[] = [];
  for (const i of intents) {
    if (!active.has(i.collection_id)) continue;
    const tokenId = tokenIdOf(i);
    if (!tokenId) continue;
    const price = intentPrice(i);
    if (!isFinite(price) || price < BAND_LO || price > BAND_HI) continue;
    const qty = tokenQty(i);
    if (qty <= 0n || qty > MAX_FILL_QTY) continue;
    out.push({ collectionId: i.collection_id, intent: i, tokenId, qty, price, side: isBuy(i) ? 'buy' : 'sell' });
  }
  return out;
}

async function executeFill(signer: { client: any; address: string }, c: FillCandidate): Promise<void> {
  const tok = c.tokenId === 1 ? 'YES' : 'NO';
  const tag = `mm:fill#${c.collectionId}(${c.side} ${tok} qty=${c.qty} @${c.price.toFixed(2)})`;
  const envelopes: unknown[] = [];

  if (c.side === 'buy') {
    // User is buying tokens → bot mints a YES+NO pair (atomically, same tx) and
    // sells the requested leg to them. Bot keeps the other leg.
    const mintApprovalId = findApprovalIdForCollection(c.collectionId, 'pm-mint-');
    if (!mintApprovalId) {
      console.warn(`${tag}: no pm-mint approval — skip`);
      cooldown(c, 'no-mint-approval');
      return;
    }
    envelopes.push(buildPredictionMarketDepositMsg(signer.address, c.collectionId, c.qty, mintApprovalId));
    envelopes.push(buildFill(signer.address, c.collectionId, c.intent, c.qty, 'incoming'));
  } else {
    // User is selling tokens → bot buys them for USDC (no mint needed).
    envelopes.push(buildFill(signer.address, c.collectionId, c.intent, c.qty, 'outgoing'));
  }

  const r = await botBroadcast(signer, envelopes, tag);
  if (r?.code === 0) {
    console.log(`[mm] ${tag} filled → tx ${r.txHash.slice(0, 12)}…`);
    // Record + publish the fill immediately so the activity feed, chart, and
    // price update in realtime — the live chain WS hangs in this container, so
    // we can't rely on the tx-watcher catching it; instead we scan THIS market's
    // recent fills (recordFill is idempotent + publishes candle/market/fills).
    // Mark the order used so the next scan doesn't retry an already-consumed
    // order (Meridian intents are afterOneUse). Without this the bot re-attempts
    // + reverts code=71 until cooldown.
    getDb()
      .prepare('UPDATE intents SET used = 1, is_active = 0 WHERE collection_id = ? AND owner_address = ? AND approval_id = ?')
      .run(c.collectionId, c.intent.owner_address, c.intent.approval_id);
    // Push the owner's updated order list so the in-app OrderFillWatcher sees
    // the order flip to filled and fires its "order filled" toast. (A raw DB
    // update alone wouldn't notify any subscriber.)
    publish(channel.intentsOwner(c.intent.owner_address), snapshotIntentsOwner(c.intent.owner_address));
    // Also refresh the collection order book so the filled order leaves the book.
    publish(channel.intents(c.collectionId), snapshotIntents(c.collectionId));
    // INSTANT price/chart publish from the fill data we already have — no chain
    // round-trip — so the chart + cards + price update the moment the fill
    // commits. (A YES fill at p → yesPrice p; a NO fill at p → yesPrice 1-p.)
    const yesPrice = c.tokenId === 1 ? c.price : 1 - c.price;
    recordCandle(c.collectionId, yesPrice, 1 - yesPrice);
    updateMarketPrice(c.collectionId, yesPrice, 1 - yesPrice);
    // Then sync the fills table (for the activity feed) — async-ish, fine if it
    // lands a beat later than the price.
    try {
      for (const f of await searchHistoricalFills(c.collectionId, 30)) recordFill(f);
    } catch (e) {
      console.warn(`[mm] post-fill sync failed for #${c.collectionId}:`, (e as Error).message);
    }
  } else if (r) {
    cooldown(c, `revert-${r.code}`);
  } else {
    cooldown(c, 'mempool-reject');
  }
}

export function startMarketMakerBot(): () => void {
  let inFlight = false;

  const tick = async () => {
    if (inFlight) return; // never overlap runs (bot shares one account/sequence)
    inFlight = true;
    try {
      const signer = await getBotSigner();
      if (!signer) return; // bot fixture missing — silently no-op
      const fills = findAllFills(signer.address);
      const fresh = fills.filter((c) => !isCooling(c));
      let filled = 0;
      for (const c of fresh.slice(0, 10)) {
        try {
          await executeFill(signer, c);
          filled++;
        } catch (e) {
          console.warn('[mm] fill step threw:', (e as Error).message);
          cooldown(c, 'thrown');
        }
      }
      if (filled > 0) {
        console.log(`[mm] scan: ${fills.length} band orders, ${filled} filled, ${fills.length - fresh.length} cooling`);
      }
    } finally {
      inFlight = false;
    }
  };

  void tick(); // sweep once on startup
  const timer = setInterval(tick, SCAN_INTERVAL_MS);
  console.log(`[mm] market-maker armed — auto-fills ${BAND_LO}–${BAND_HI} band every ${SCAN_INTERVAL_MS}ms`);
  return () => clearInterval(timer);
}
