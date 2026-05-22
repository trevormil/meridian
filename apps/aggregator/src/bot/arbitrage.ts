import {
  buildPredictionMarketDepositMsg,
  buildPredictionMarketRedeemTx,
} from 'bitbadges';

// The SDK builds this same constant internally but doesn't re-export it.
// Inlining keeps us decoupled from the private export.
const PM_FULL_OWNERSHIP = [{ start: '1', end: '18446744073709551615' }];
import { env } from '../env.js';
import { getDb } from '../db/index.js';
import { listIntentsByCollection } from '../db/intents.js';
import { getBotSigner, botBroadcast } from './signer.js';

/**
 * Arbitrage bot. Runs every N seconds. Two strategies:
 *
 *   1. **Expensive-pair arb** — when sum(buy_YES_price, buy_NO_price) > 1:
 *        - deposit $1 → mint 1 YES + 1 NO
 *        - fill the buy_YES at price p_y → receive p_y USDC, lose 1 YES
 *        - fill the buy_NO  at price p_n → receive p_n USDC, lose 1 NO
 *        - net: spent $1, received (p_y + p_n) > $1
 *
 *   2. **Cheap-pair arb** — when sum(sell_YES_price, sell_NO_price) < 1:
 *        - fill the sell_YES at price p_y → pay p_y USDC, receive 1 YES
 *        - fill the sell_NO  at price p_n → pay p_n USDC, receive 1 NO
 *        - pre-settlement redeem 1 YES + 1 NO → 1 USDC
 *        - net: spent (p_y + p_n) < $1, received $1
 *
 * For partial-amount matching, we limit each arb to the smaller of the two
 * intents' remaining token amounts. Chain accepts that — limit orders can be
 * partially filled.
 */

const SCAN_INTERVAL_MS = 4_000; // ~every 3 blocks — eases chain contention so
// the seeder's order batches commit (they timed out when this hammered queries
// every 1.5s on the 2-vCPU node). Still feels live.
const MIN_PROFIT_USDC = 100n; // 0.0001 USDC base units — anything smaller is fee noise

/**
 * Recent-failure cooldown. When the chain rejects an arb execution (insufficient
 * balance, intent already filled, approval expired since we last polled, etc),
 * we blacklist that exact pairing for COOLDOWN_MS so we don't burn gas retrying
 * the same hopeless trade every 5 seconds.
 */
const COOLDOWN_MS = 60_000;
const recentFailures = new Map<string, number>();
function failureKey(arb: ArbCandidate): string {
  return `${arb.kind}|${arb.collectionId}|${arb.yes.approval_id}|${arb.no.approval_id}`;
}
function isBlacklisted(arb: ArbCandidate): boolean {
  const k = failureKey(arb);
  const until = recentFailures.get(k);
  if (!until) return false;
  if (Date.now() > until) {
    recentFailures.delete(k);
    return false;
  }
  return true;
}
function blacklist(arb: ArbCandidate, reason: string): void {
  recentFailures.set(failureKey(arb), Date.now() + COOLDOWN_MS);
  console.log(`[bot] cooldown ${failureKey(arb).slice(0, 60)}… (${reason})`);
}

function intentPrice(i: ReturnType<typeof listIntentsByCollection>[number]): number {
  // payDenom + receiveDenom + amounts determine price. We work in USDC base
  // units against token (1 / 1) ratio.
  const pay = i.pay_denom ?? '';
  const recv = i.receive_denom ?? '';
  const payTok = pay.startsWith('badgeslp:');
  const recvTok = recv.startsWith('badgeslp:');
  if (payTok === recvTok) return NaN; // both or neither → not a normal price intent
  const tokenAmt = Number(payTok ? i.pay_amount : i.receive_amount);
  const coinAmt = Number(payTok ? i.receive_amount : i.pay_amount);
  if (tokenAmt <= 0) return NaN;
  return coinAmt / tokenAmt;
}

interface ArbCandidate {
  collectionId: string;
  yes: ReturnType<typeof listIntentsByCollection>[number];
  no: ReturnType<typeof listIntentsByCollection>[number];
  /** Token quantity we can match across both legs. */
  qty: bigint;
  /** USDC profit at the matched quantity, in base units. */
  profit: bigint;
  /** Strategy kind:
   *   `expensive-pair` — buy_YES + buy_NO sum > $1: deposit $1, fill both buys
   *   `cheap-pair`     — sell_YES + sell_NO sum < $1: fill both sells, redeem
   *   `cross`          — bid.price >= ask.price on the SAME token side: just
   *                      match them (one tx using both approvals, bot takes
   *                      the spread). `yes` is the BID, `no` is the ASK by
   *                      convention here even when both are YES — the field
   *                      names are kept for executeArb's structural reuse.
   */
  kind: 'expensive-pair' | 'cheap-pair' | 'cross';
}

function tokenIdOf(intent: ReturnType<typeof listIntentsByCollection>[number]): 1 | 2 | null {
  const pay = intent.pay_denom ?? '';
  const recv = intent.receive_denom ?? '';
  const token = pay.startsWith('badgeslp:') ? pay : recv.startsWith('badgeslp:') ? recv : null;
  if (!token) return null;
  if (token.endsWith(':uyes')) return 1;
  if (token.endsWith(':uno')) return 2;
  return null;
}

function isBuy(intent: ReturnType<typeof listIntentsByCollection>[number]): boolean {
  // BUY intents are incoming approvals: from the bot's perspective filling
  // an incoming approval = giving token to the owner + receiving USDC.
  return intent.approval_level === 'incoming';
}

function isSell(intent: ReturnType<typeof listIntentsByCollection>[number]): boolean {
  return intent.approval_level === 'outgoing';
}

/**
 * Token quantity an intent governs. For a BUY (incoming), the user is paying
 * USDC and receiving tokens → token count is in `receive_amount`. For a SELL
 * (outgoing), reversed: user pays token, receives USDC → token count is in
 * `pay_amount`. We use this everywhere `qty` is passed to a fill — the seeder's
 * intents have `allowAmountScaling: false`, so a partial-amount fill silently
 * reverts.
 */
function tokenQty(intent: ReturnType<typeof listIntentsByCollection>[number]): bigint {
  const payIsTok = (intent.pay_denom ?? '').startsWith('badgeslp:');
  return payIsTok ? toBig(intent.pay_amount) : toBig(intent.receive_amount);
}

function findArbs(collectionId: string, botAddress: string): ArbCandidate[] {
  const intents = listIntentsByCollection(collectionId, { activeOnly: true });
  // Skip the bot's own intents — we never arb ourselves.
  const others = intents.filter((i) => i.owner_address !== botAddress);

  const yesBuys = others.filter((i) => isBuy(i) && tokenIdOf(i) === 1);
  const noBuys = others.filter((i) => isBuy(i) && tokenIdOf(i) === 2);
  const yesSells = others.filter((i) => isSell(i) && tokenIdOf(i) === 1);
  const noSells = others.filter((i) => isSell(i) && tokenIdOf(i) === 2);

  const out: ArbCandidate[] = [];

  // Expensive-pair: pair the highest-price YES buy with the highest-price NO buy.
  // Without amount scaling, the FILL must match the approval's exact token
  // count, so we can only arb when both legs cover the same quantity.
  for (const y of yesBuys.sort((a, b) => intentPrice(b) - intentPrice(a))) {
    for (const n of noBuys.sort((a, b) => intentPrice(b) - intentPrice(a))) {
      const py = intentPrice(y);
      const pn = intentPrice(n);
      if (!isFinite(py) || !isFinite(pn)) continue;
      if (py + pn <= 1) continue;
      const qyes = tokenQty(y);
      const qno = tokenQty(n);
      if (qyes !== qno) continue; // exact-match only
      const qty = qyes;
      const proceeds = BigInt(Math.floor(Number(qty) * (py + pn)));
      const cost = qty; // 1 USDC base unit per minted YES+NO pair
      const profit = proceeds - cost;
      if (profit > MIN_PROFIT_USDC) {
        out.push({ collectionId, yes: y, no: n, qty, profit, kind: 'expensive-pair' });
      }
    }
  }

  // Cheap-pair: pair lowest-price YES sell with lowest-price NO sell.
  for (const y of yesSells.sort((a, b) => intentPrice(a) - intentPrice(b))) {
    for (const n of noSells.sort((a, b) => intentPrice(a) - intentPrice(b))) {
      const py = intentPrice(y);
      const pn = intentPrice(n);
      if (!isFinite(py) || !isFinite(pn)) continue;
      if (py + pn >= 1) continue;
      const qyes = tokenQty(y);
      const qno = tokenQty(n);
      if (qyes !== qno) continue; // exact-match only
      const qty = qyes;
      const cost = BigInt(Math.floor(Number(qty) * (py + pn)));
      const proceeds = qty; // redemption returns 1 USDC base unit per pair
      const profit = proceeds - cost;
      if (profit > MIN_PROFIT_USDC) {
        out.push({ collectionId, yes: y, no: n, qty, profit, kind: 'cheap-pair' });
      }
    }
  }

  // Cross-match: bid.price >= ask.price on the SAME token side. Includes the
  // bot's OWN orders on one side — the seeder posts a sell ladder (0.55..0.95)
  // and users typically post bids that cross into it. We facilitate the fill
  // and pocket the spread. Includes all (user-bid × bot-ask), (bot-bid × user-ask),
  // and (user-bid × user-ask) combinations, but NOT (bot-bid × bot-ask) — that
  // would be the bot trading with itself, the seed ladder is intentionally
  // monotone so no such cross exists.
  const allBidsYes = intents.filter((i) => isBuy(i) && tokenIdOf(i) === 1);
  const allAsksYes = intents.filter((i) => isSell(i) && tokenIdOf(i) === 1);
  const allBidsNo = intents.filter((i) => isBuy(i) && tokenIdOf(i) === 2);
  const allAsksNo = intents.filter((i) => isSell(i) && tokenIdOf(i) === 2);

  for (const [bids, asks] of [
    [allBidsYes, allAsksYes],
    [allBidsNo, allAsksNo],
  ] as const) {
    for (const b of bids.sort((a, c) => intentPrice(c) - intentPrice(a))) {
      for (const a of asks.sort((x, y) => intentPrice(x) - intentPrice(y))) {
        if (b.owner_address === botAddress && a.owner_address === botAddress) continue;
        const pb = intentPrice(b);
        const pa = intentPrice(a);
        if (!isFinite(pb) || !isFinite(pa)) continue;
        if (pa > pb) continue; // no cross
        const qb = tokenQty(b);
        const qa = tokenQty(a);
        if (qb !== qa) continue; // exact-match only (no scaling on seed intents)
        const qty = qb;
        const profit = BigInt(Math.floor(Number(qty) * (pb - pa)));
        if (profit > MIN_PROFIT_USDC) {
          out.push({ collectionId, yes: b, no: a, qty, profit, kind: 'cross' });
        }
      }
    }
  }

  return out;
}

function toBig(v: string | null | undefined): bigint {
  if (!v) return 0n;
  try { return BigInt(v); } catch { return 0n; }
}
function bigMin(a: bigint, b: bigint): bigint { return a < b ? a : b; }

async function executeArb(
  signer: { client: any; address: string },
  arb: ArbCandidate,
): Promise<void> {
  const tag = `arb:${arb.kind}#${arb.collectionId}(qty=${arb.qty},profit=${arb.profit})`;
  const envelopes: unknown[] = [];

  if (arb.kind === 'cross') {
    // Bid + ask on same token side, prices crossed. Single MsgTransferTokens
    // that lists BOTH approvals — the chain runs each side's coin transfer
    // independently (buyer pays, seller receives, bot keeps the spread via
    // the approval's overrideToWithInitiator on the buy leg).
    envelopes.push(buildCrossFill(signer.address, arb));
  } else if (arb.kind === 'expensive-pair') {
    // 1. deposit `qty` USDC → mint `qty` YES + `qty` NO
    const mintApprovalId = findApprovalIdForCollection(arb.collectionId, 'pm-mint-');
    if (!mintApprovalId) {
      console.warn(`${tag}: no pm-mint approval — abort`);
      return;
    }
    envelopes.push(buildPredictionMarketDepositMsg(signer.address, arb.collectionId, arb.qty, mintApprovalId));
    // 2. fill yes buy: send YES to its owner (from=bot), receive USDC
    envelopes.push(buildFill(signer.address, arb.collectionId, arb.yes, arb.qty, 'incoming'));
    // 3. fill no buy
    envelopes.push(buildFill(signer.address, arb.collectionId, arb.no, arb.qty, 'incoming'));
  } else {
    // cheap-pair: fill both sells, then redeem the pair for USDC
    envelopes.push(buildFill(signer.address, arb.collectionId, arb.yes, arb.qty, 'outgoing'));
    envelopes.push(buildFill(signer.address, arb.collectionId, arb.no, arb.qty, 'outgoing'));
    const redeem = findApprovalIdForCollection(arb.collectionId, 'pm-redeem-');
    if (!redeem) {
      console.warn(`${tag}: no pm-redeem approval — skip (will redeem next sweep)`);
    } else {
      const tx = buildPredictionMarketRedeemTx({
        creator: signer.address,
        collectionId: arb.collectionId,
        state: 'active',
        pairAmount: arb.qty,
        yesBalance: arb.qty,
        noBalance: arb.qty,
        redeemApprovalId: redeem,
      });
      envelopes.push(...tx.messages);
    }
  }

  const r = await botBroadcast(signer, envelopes, tag);
  if (r?.code === 0) {
    console.log(`[bot] ${tag} executed → tx ${r.txHash.slice(0, 12)}…`);
  } else if (r) {
    // Chain accepted the tx into the mempool but DeliverTx failed. Classify
    // and cooldown so we don't retry the same hopeless trade every sweep.
    const reason = classifyRevert(r.rawLog);
    blacklist(arb, reason);
  } else {
    // Mempool reject — usually a sequence / encoding issue. Quick cooldown
    // so the next sweep doesn't hammer the same intent pair.
    blacklist(arb, 'mempool-reject');
  }
}

/** Map a chain revert log to a short human reason for the cooldown log. */
function classifyRevert(rawLog: string): string {
  const l = rawLog.toLowerCase();
  if (l.includes('insufficient')) return 'insufficient-balance';
  if (l.includes('approval') && l.includes('not found')) return 'approval-gone';
  if (l.includes('transferability error')) return 'approval-mismatch';
  if (l.includes('expired')) return 'approval-expired';
  if (l.includes('amount')) return 'amount-rejected';
  return 'unknown-revert';
}

/**
 * Cross-match fill: bid (incoming approval) + ask (outgoing approval) on the
 * same token side. ONE MsgTransferTokens with both approvals listed; chain
 * runs each side's coin transfer independently. Bot is the initiator and
 * receives the spread because the bid's coinTransfer has
 * `overrideToWithInitiator: true` (sends buyer's USDC to whoever filled).
 */
function buildCrossFill(botAddress: string, arb: ArbCandidate): unknown {
  const bid = arb.yes; // by convention in `findArbs` for 'cross'
  const ask = arb.no;
  const tokenId = tokenIdOf(bid);
  if (!tokenId) throw new Error('cross: no token id');
  const tokenIds = [{ start: String(tokenId), end: String(tokenId) }];
  const balances = [{ amount: arb.qty.toString(), tokenIds, ownershipTimes: PM_FULL_OWNERSHIP }];
  return {
    typeUrl: '/tokenization.MsgTransferTokens',
    value: {
      creator: botAddress,
      collectionId: arb.collectionId,
      transfers: [
        {
          // Token moves: seller (ask owner) → buyer (bid owner).
          from: ask.owner_address,
          toAddresses: [bid.owner_address],
          balances,
          prioritizedApprovals: [
            {
              approvalId: ask.approval_id,
              approvalLevel: 'outgoing',
              approverAddress: ask.owner_address,
              version: '0',
            },
            {
              approvalId: bid.approval_id,
              approvalLevel: 'incoming',
              approverAddress: bid.owner_address,
              version: '0',
            },
          ],
          onlyCheckPrioritizedCollectionApprovals: false,
          onlyCheckPrioritizedOutgoingApprovals: true,
          onlyCheckPrioritizedIncomingApprovals: true,
          memo: '',
        },
      ],
    },
  };
}

function buildFill(
  botAddress: string,
  collectionId: string,
  intent: ReturnType<typeof listIntentsByCollection>[number],
  tokenAmount: bigint,
  approvalLevel: 'incoming' | 'outgoing',
): unknown {
  const tokenId = tokenIdOf(intent);
  if (!tokenId) throw new Error('intent has no resolvable token id');
  const tokenIds = [{ start: String(tokenId), end: String(tokenId) }];
  const balances = [{ amount: tokenAmount.toString(), tokenIds, ownershipTimes: PM_FULL_OWNERSHIP }];
  const transfer =
    approvalLevel === 'incoming'
      ? { from: botAddress, toAddresses: [intent.owner_address] } // bot sends token TO the buyer
      : { from: intent.owner_address, toAddresses: [botAddress] }; // bot receives token FROM the seller
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

export function startArbitrageBot(): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  const tick = async () => {
    if (inFlight) return; // never overlap runs
    inFlight = true;
    try {
      const signer = await getBotSigner();
      if (!signer) return; // bot fixture missing — silently no-op
      // Iterate active markets, run the arb scan, execute any profitable hits.
      const markets = getDb()
        .prepare("SELECT collection_id FROM markets WHERE status = 'active'")
        .all() as Array<{ collection_id: string }>;
      let executed = 0;
      let blacklisted = 0;
      let scanned = 0;
      for (const m of markets) {
        const arbs = findArbs(m.collection_id, signer.address);
        scanned += arbs.length;
        // Filter out anything in the recent-failure cooldown.
        const fresh = arbs.filter((a) => !isBlacklisted(a));
        blacklisted += arbs.length - fresh.length;
        for (const arb of fresh.slice(0, 3)) {
          // Cap per-tick per-market hits to 3 — we'll catch the rest next sweep.
          try {
            await executeArb(signer, arb);
            executed++;
          } catch (e) {
            console.warn('[bot] arb step failed:', (e as Error).message);
            blacklist(arb, 'thrown');
          }
        }
      }
      if (executed > 0 || (scanned > 0 && Math.random() < 0.05)) {
        // Quiet log most ticks; only print scan summary when something happens
        // OR ~5% of empty ticks so the operator knows the bot is still alive.
        console.log(`[bot] arb scan: ${scanned} opportunities, ${executed} executed, ${blacklisted} in cooldown`);
      }
    } finally {
      inFlight = false;
    }
  };

  void tick();
  timer = setInterval(tick, SCAN_INTERVAL_MS);
  console.log(`[bot] arbitrage scanner armed (every ${SCAN_INTERVAL_MS / 1000}s)`);
  return () => {
    if (timer) clearInterval(timer);
  };
}
