import { buildPredictionMarketDepositMsg } from 'bitbadges';
import { getDb } from '../db/index.js';
import { listIntentsByCollection } from '../db/intents.js';
import { getBotSigner, botBroadcast } from './signer.js';
import { searchHistoricalFills } from '../chain/events.js';
import { recordFill } from '../workers/tx-watcher.js';

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
// with a fast timer instead of a block subscription. 800ms ≈ ~every block at
// 500ms timeout_commit; reliable and not WS-dependent.
const SCAN_INTERVAL_MS = 800;
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

type Intent = ReturnType<typeof listIntentsByCollection>[number];

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

function findFills(collectionId: string, botAddress: string): FillCandidate[] {
  const intents = listIntentsByCollection(collectionId, { activeOnly: true });
  const out: FillCandidate[] = [];
  for (const i of intents) {
    if (i.owner_address === botAddress) continue; // never fill our own orders
    const tokenId = tokenIdOf(i);
    if (!tokenId) continue;
    const price = intentPrice(i);
    if (!isFinite(price) || price < BAND_LO || price > BAND_HI) continue;
    const qty = tokenQty(i);
    if (qty <= 0n || qty > MAX_FILL_QTY) continue;
    out.push({ collectionId, intent: i, tokenId, qty, price, side: isBuy(i) ? 'buy' : 'sell' });
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
      const markets = getDb()
        .prepare("SELECT collection_id FROM markets WHERE status = 'active'")
        .all() as Array<{ collection_id: string }>;
      let filled = 0;
      let cooling = 0;
      let found = 0;
      for (const m of markets) {
        const fills = findFills(m.collection_id, signer.address);
        found += fills.length;
        const fresh = fills.filter((c) => !isCooling(c));
        cooling += fills.length - fresh.length;
        for (const c of fresh.slice(0, 5)) {
          try {
            await executeFill(signer, c);
            filled++;
          } catch (e) {
            console.warn('[mm] fill step threw:', (e as Error).message);
            cooldown(c, 'thrown');
          }
        }
      }
      if (filled > 0) console.log(`[mm] scan: ${found} band orders, ${filled} filled, ${cooling} cooling`);
    } finally {
      inFlight = false;
    }
  };

  void tick(); // sweep once on startup
  const timer = setInterval(tick, SCAN_INTERVAL_MS);
  console.log(`[mm] market-maker armed — auto-fills ${BAND_LO}–${BAND_HI} band every ${SCAN_INTERVAL_MS}ms`);
  return () => clearInterval(timer);
}
