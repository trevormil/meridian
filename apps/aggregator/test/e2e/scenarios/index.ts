/**
 * E2E scenarios. Each scenario:
 *   - Creates a fresh prediction market (so scenarios are independent)
 *   - Runs the relevant flow with the two personas
 *   - Asserts both chain state AND aggregator DB state
 *
 * Patterns:
 *   - `sleep(blockTime)` between txs so chain has committed
 *   - `until()` for aggregator state — backfill runs on a 30s sweep + every
 *     5-block tick, so we may need to wait a few seconds for fill-derived
 *     candles to land
 */
import { config } from '../lib/config.js';
import { log, assertEq, assertClose, assertTrue } from '../lib/log.js';
import { sleep, until } from '../lib/wait.js';
import { type Signer } from '../lib/signers.js';
import {
  createMarket,
  deposit,
  postIntent,
  cancelIntent,
  fillIntent,
  vote,
  redeem,
  approvalsFromCollection,
} from '../lib/txs.js';
import {
  getMarket,
  listIntents,
  listIntentsForOwner,
  listCandles,
  getCollectionFromChain,
  getBankBalance,
  getYesNoBalance,
} from '../lib/queries.js';

export interface Ctx {
  alice: Signer;
  bob: Signer;
}

export interface Scenario {
  name: string;
  run: (ctx: Ctx) => Promise<void>;
}

/**
 * Helper: poll aggregator until predicate is satisfied. Returns the value.
 */
async function untilAgg<T>(what: string, fn: () => T | null | undefined | false): Promise<T> {
  return until(async () => fn() as any, { what: `aggregator ${what}`, timeoutMs: 20_000, intervalMs: 500 });
}

/**
 * Find the highest collection id currently present on chain. Walks upward
 * from `from` (default 1) until two consecutive 404/500s, returning the last
 * known-good id. Bounded by `cap` to avoid hangs.
 */
async function findHighestCollectionId(from = 1, cap = 200): Promise<number> {
  let last = from - 1;
  let consecutiveMisses = 0;
  for (let id = from; id <= cap; id++) {
    const c = await getCollectionFromChain(String(id));
    if (c) {
      last = id;
      consecutiveMisses = 0;
    } else {
      consecutiveMisses++;
      if (consecutiveMisses >= 2) break;
    }
  }
  return last;
}

/**
 * Bootstrap a fresh market and wait for the aggregator to index it.
 * Returns the chain collection + parsed approvalIds.
 *
 * Discovery is fast: we record the pre-tx head, send createMarket, then poll
 * one id at a time starting from head+1 (avoids the prior O(1000) scan).
 */
export async function bootstrapMarket(creator: Signer, name: string): Promise<{ collectionId: string; collection: any; approvals: ReturnType<typeof approvalsFromCollection> }> {
  const before = await findHighestCollectionId();
  log.step(`creating market "${name}" (current head=#${before})`);
  await createMarket(creator, { name });

  const found = await until(
    async () => {
      const c = await getCollectionFromChain(String(before + 1));
      return c ? { collection: c, collectionId: String(before + 1) } : null;
    },
    { what: `collection #${before + 1}`, timeoutMs: 15_000, intervalMs: 750 },
  );

  log.ok(`market created → #${found.collectionId}`);
  const approvals = approvalsFromCollection(found.collection);

  await untilAgg(`indexes market #${found.collectionId}`, () => getMarket(found.collectionId));
  return { collectionId: found.collectionId, collection: found.collection, approvals };
}

// ──────────────────────────────────────────────────────────────────────────
// Scenario 1: deposit + intent fill (the canonical price-discovery flow)
// ──────────────────────────────────────────────────────────────────────────
export const depositAndFill: Scenario = {
  name: 'deposit + intent fill emits correct price candle',
  run: async ({ alice, bob }) => {
    const { collectionId, approvals } = await bootstrapMarket(alice, `e2e-fill-${Date.now()}`);

    // Both deposit 50 USDC → 50M YES + 50M NO each.
    const DEPOSIT = 50_000_000n;
    log.step('alice + bob each deposit 50 USDC');
    await deposit(alice, collectionId, DEPOSIT, approvals.mintApprovalId!);
    await deposit(bob, collectionId, DEPOSIT, approvals.mintApprovalId!);

    // Chain balances after deposit.
    const aliceBal = await getYesNoBalance(collectionId, alice.persona.address);
    const bobBal = await getYesNoBalance(collectionId, bob.persona.address);
    assertEq('alice YES post-deposit', aliceBal.yes, DEPOSIT);
    assertEq('alice NO post-deposit', aliceBal.no, DEPOSIT);
    assertEq('bob YES post-deposit', bobBal.yes, DEPOSIT);
    assertEq('bob NO post-deposit', bobBal.no, DEPOSIT);

    // Aggregator escrow total reflects ~100 USDC (minus tiny protocol fees).
    const market = await untilAgg('totalDeposited reflects 100 USDC', () => {
      const m = getMarket(collectionId);
      return m && BigInt(m.total_deposited) >= 99_500_000n ? m : null;
    });
    log.ok(`aggregator total_deposited = ${market.total_deposited}`);

    // Alice sells 1M YES at 0.60 USDC each → 600,000 USDC base units. Bob fills.
    const FILL_QTY = 1_000_000n;
    const PRICE = 0.6;
    log.step('alice posts SELL YES @ 0.60');
    const { approvalId } = await postIntent(alice, {
      collectionId,
      side: 'yes',
      direction: 'sell',
      tokenAmount: FILL_QTY,
      price: PRICE,
    });

    // Aggregator should see alice's outgoing approval.
    const aliceIntent = await untilAgg('aggregator records alice intent', () => {
      const list = listIntentsForOwner(alice.persona.address, collectionId).filter((i) => i.approval_id === approvalId);
      return list.length === 1 ? list[0] : null;
    });
    assertEq('intent.used pre-fill', aliceIntent.used, 0);
    assertEq('intent.approval_level', aliceIntent.approval_level, 'outgoing');

    log.step('bob fills alice intent');
    await fillIntent(bob, {
      collectionId,
      ownerAddress: alice.persona.address,
      approvalId,
      approvalLevel: 'outgoing',
      tokenId: 1,
      tokenAmount: FILL_QTY,
    });

    // Verify chain balances shifted correctly.
    const aliceAfter = await getYesNoBalance(collectionId, alice.persona.address);
    const bobAfter = await getYesNoBalance(collectionId, bob.persona.address);
    assertEq('alice YES post-fill (sold 1M)', aliceAfter.yes, DEPOSIT - FILL_QTY);
    assertEq('bob YES post-fill (bought 1M)', bobAfter.yes, DEPOSIT + FILL_QTY);
    assertEq('alice NO unchanged', aliceAfter.no, DEPOSIT);
    assertEq('bob NO unchanged', bobAfter.no, DEPOSIT);

    // Aggregator: intent should be marked used (afterOneUse purges it from chain).
    await untilAgg('intent marked used', () => {
      const list = listIntentsForOwner(alice.persona.address, collectionId).filter((i) => i.approval_id === approvalId);
      return list.length === 1 && list[0].used === 1 ? list[0] : null;
    });
    log.ok('aggregator marked intent used');

    // Aggregator: price candle at ~0.6 (minus protocol fee).
    const candle = await untilAgg(`price candle at ${PRICE}`, () => {
      const cs = listCandles(collectionId, '10m');
      return cs.length > 0 ? cs[cs.length - 1] : null;
    });
    assertClose('candle YES price', candle.yes_price, PRICE, 0.005);

    // Headline price updated.
    const mAfter = getMarket(collectionId);
    assertClose('market.yes_price', mAfter!.yes_price, PRICE, 0.005);
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Scenario 2: cancel intent before fill — must NOT emit a price candle
// ──────────────────────────────────────────────────────────────────────────
export const intentCancel: Scenario = {
  name: 'cancel intent marks it used + does not emit fake candle',
  run: async ({ alice }) => {
    const { collectionId, approvals } = await bootstrapMarket(alice, `e2e-cancel-${Date.now()}`);
    await deposit(alice, collectionId, 10_000_000n, approvals.mintApprovalId!);

    const candlesBefore = listCandles(collectionId, '10m').length;

    log.step('alice posts BUY NO @ 0.30 then cancels');
    const { approvalId } = await postIntent(alice, {
      collectionId,
      side: 'no',
      direction: 'buy',
      tokenAmount: 1_000_000n,
      price: 0.3,
    });

    const intent = await untilAgg('aggregator records buy intent', () => {
      const list = listIntentsForOwner(alice.persona.address, collectionId).filter((i) => i.approval_id === approvalId);
      return list.length === 1 ? list[0] : null;
    });
    assertEq('buy intent.approval_level', intent.approval_level, 'incoming');

    await cancelIntent(alice, { collectionId, approvalId, approvalLevel: 'incoming' });

    // After cancel: chain no longer has the approval → aggregator should mark used.
    await untilAgg('cancel marks used', () => {
      const list = listIntentsForOwner(alice.persona.address, collectionId).filter((i) => i.approval_id === approvalId);
      return list.length === 1 && list[0].used === 1 ? list[0] : null;
    });

    // Crucially: no candle should have been emitted (it wasn't filled).
    await sleep(3000);
    const candlesAfter = listCandles(collectionId, '10m').length;
    assertEq('no new candle from cancel', candlesAfter, candlesBefore);
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Scenario 3: pre-settlement pair redeem
// ──────────────────────────────────────────────────────────────────────────
export const preSettlementRedeem: Scenario = {
  name: 'pre-settlement pair redeem returns 1:1 USDC',
  run: async ({ alice }) => {
    const { collectionId, approvals } = await bootstrapMarket(alice, `e2e-active-redeem-${Date.now()}`);

    const usdcBefore = await getBankBalance(alice.persona.address, config.usdcDenom);
    const DEPOSIT = 10_000_000n;
    await deposit(alice, collectionId, DEPOSIT, approvals.mintApprovalId!);
    const usdcAfterDeposit = await getBankBalance(alice.persona.address, config.usdcDenom);
    // Alice spent DEPOSIT (plus protocol fee, which is small).
    assertTrue('USDC dropped by ~deposit', usdcBefore - usdcAfterDeposit >= DEPOSIT && usdcBefore - usdcAfterDeposit <= DEPOSIT + 100_000n);

    const REDEEM = 4_000_000n;
    log.step(`alice burns ${REDEEM} YES+NO pairs (pre-settlement redeem)`);
    await redeem(alice, {
      collectionId,
      state: 'active',
      pairAmount: REDEEM,
      approvals: { redeemApprovalId: approvals.redeemApprovalId },
    });

    const balAfter = await getYesNoBalance(collectionId, alice.persona.address);
    assertEq('alice YES after redeem', balAfter.yes, DEPOSIT - REDEEM);
    assertEq('alice NO after redeem', balAfter.no, DEPOSIT - REDEEM);

    const usdcFinal = await getBankBalance(alice.persona.address, config.usdcDenom);
    // Got back approx REDEEM USDC (minus protocol fees on both deposit + redeem).
    const recovered = usdcFinal - usdcAfterDeposit;
    assertTrue(`recovered ~${REDEEM} USDC (got ${recovered})`, recovered >= REDEEM - 200_000n && recovered <= REDEEM + 100_000n);
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Scenario 4: YES wins resolution
// ──────────────────────────────────────────────────────────────────────────
export const yesWinsScenario: Scenario = {
  name: 'YES wins: vote → status flips → YES holders redeem 1:1',
  run: async ({ alice, bob }) => {
    const { collectionId, approvals } = await bootstrapMarket(alice, `e2e-yes-wins-${Date.now()}`);

    // Deposit + redeem both pay a tiny protocol fee, so the escrow always
    // holds slightly less than the gross deposit amount. We deposit 10M but
    // only redeem 9M to leave headroom for the fees on both legs.
    await deposit(bob, collectionId, 10_000_000n, approvals.mintApprovalId!);
    const usdcBefore = await getBankBalance(bob.persona.address, config.usdcDenom);

    log.step('alice (verifier) votes YES wins');
    await vote(alice, { collectionId, approvalId: approvals.yesWinsApprovalId! });

    await untilAgg('market status → resolved-yes', () => {
      const m = getMarket(collectionId);
      return m && m.status === 'resolved-yes' ? m : null;
    });
    log.ok('aggregator: status = resolved-yes');

    const REDEEM = 9_000_000n;
    log.step(`bob burns ${REDEEM} YES (winner) — should receive ~${REDEEM} USDC`);
    await redeem(bob, {
      collectionId,
      state: 'yes-wins',
      yesBalance: REDEEM,
      noBalance: 0n,
      approvals: { yesWinsApprovalId: approvals.yesWinsApprovalId },
    });

    const bobAfter = await getYesNoBalance(collectionId, bob.persona.address);
    assertEq('bob YES after redeem (10M - 9M)', bobAfter.yes, 10_000_000n - REDEEM);

    const usdcAfter = await getBankBalance(bob.persona.address, config.usdcDenom);
    const gained = usdcAfter - usdcBefore;
    assertTrue(`bob recovered ~9M USDC (got ${gained})`, gained >= 8_900_000n && gained <= 9_100_000n);
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Scenario 5: NO wins
// ──────────────────────────────────────────────────────────────────────────
export const noWinsScenario: Scenario = {
  name: 'NO wins: vote → status flips → NO holders redeem 1:1',
  run: async ({ alice, bob }) => {
    const { collectionId, approvals } = await bootstrapMarket(alice, `e2e-no-wins-${Date.now()}`);

    await deposit(bob, collectionId, 5_000_000n, approvals.mintApprovalId!);
    const usdcBefore = await getBankBalance(bob.persona.address, config.usdcDenom);

    log.step('alice (verifier) votes NO wins');
    await vote(alice, { collectionId, approvalId: approvals.noWinsApprovalId! });

    await untilAgg('market status → resolved-no', () => {
      const m = getMarket(collectionId);
      return m && m.status === 'resolved-no' ? m : null;
    });

    const REDEEM = 4_500_000n; // <5M deposit to leave fee buffer in escrow
    log.step(`bob burns ${REDEEM} NO (winner)`);
    await redeem(bob, {
      collectionId,
      state: 'no-wins',
      yesBalance: 0n,
      noBalance: REDEEM,
      approvals: { noWinsApprovalId: approvals.noWinsApprovalId },
    });

    const bobAfter = await getYesNoBalance(collectionId, bob.persona.address);
    assertEq('bob NO after redeem (5M - 4.5M)', bobAfter.no, 5_000_000n - REDEEM);

    const usdcAfter = await getBankBalance(bob.persona.address, config.usdcDenom);
    const gained = usdcAfter - usdcBefore;
    assertTrue(`bob recovered ~4.5M USDC (got ${gained})`, gained >= 4_400_000n && gained <= 4_600_000n);
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Scenario 6: Push (indeterminate) — both sides get 0.5
// ──────────────────────────────────────────────────────────────────────────
export const pushScenario: Scenario = {
  name: 'Push: both push proposals pass → both sides redeem ½',
  run: async ({ alice, bob }) => {
    const { collectionId, approvals } = await bootstrapMarket(alice, `e2e-push-${Date.now()}`);

    await deposit(bob, collectionId, 4_000_000n, approvals.mintApprovalId!);
    const usdcBefore = await getBankBalance(bob.persona.address, config.usdcDenom);

    log.step('alice votes push-YES + push-NO');
    await vote(alice, { collectionId, approvalId: approvals.pushYesApprovalId! });
    await vote(alice, { collectionId, approvalId: approvals.pushNoApprovalId! });

    await untilAgg('market status → resolved-push', () => {
      const m = getMarket(collectionId);
      return m && m.status === 'resolved-push' ? m : null;
    });

    // Push pays 0.5 per token (each side). 3.5M of each side → 1.75M + 1.75M
    // = 3.5M USDC, well under the ~3.99M escrow balance.
    const REDEEM = 3_500_000n;
    log.step(`bob burns ${REDEEM} of each side at 0.5 each`);
    await redeem(bob, {
      collectionId,
      state: 'push',
      yesBalance: REDEEM,
      noBalance: REDEEM,
      approvals: {
        pushYesApprovalId: approvals.pushYesApprovalId,
        pushNoApprovalId: approvals.pushNoApprovalId,
      },
    });

    const bobAfter = await getYesNoBalance(collectionId, bob.persona.address);
    assertEq('bob YES after redeem (4M - 3.5M)', bobAfter.yes, 4_000_000n - REDEEM);
    assertEq('bob NO after redeem (4M - 3.5M)', bobAfter.no, 4_000_000n - REDEEM);

    const usdcAfter = await getBankBalance(bob.persona.address, config.usdcDenom);
    const gained = usdcAfter - usdcBefore;
    // 3.5M YES + 3.5M NO each at 0.5 = 3.5M USDC total
    assertTrue(`bob recovered ~3.5M USDC (got ${gained})`, gained >= 3_400_000n && gained <= 3_600_000n);
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Scenario 7: price evolves correctly across a sequence of trades.
//
// Canonical formula (see src/chain/events.ts → impliedYesPrice):
//   yes_price = coin/token for YES fills, (1 - coin/token) for NO fills.
//   headline `markets.yes_price` always reflects the LAST fill.
//   candle `close` within a timeframe bucket updates per-fill.
//
// We trade three times and check the headline + the latest candle's close
// after each. Within one timeframe bucket the candle row stays the same but
// its `close` advances to the latest fill price.
// ──────────────────────────────────────────────────────────────────────────
export const priceEvolution: Scenario = {
  name: 'price chart tracks sequential trades correctly',
  run: async ({ alice, bob }) => {
    const { collectionId, approvals } = await bootstrapMarket(alice, `e2e-price-${Date.now()}`);

    const DEPOSIT = 20_000_000n;
    await deposit(alice, collectionId, DEPOSIT, approvals.mintApprovalId!);
    await deposit(bob, collectionId, DEPOSIT, approvals.mintApprovalId!);

    /** Place an intent + fill it from the counterparty, then verify the
     *  aggregator's headline price + the latest candle's close = expected. */
    async function tradeAndVerify(args: {
      poster: Signer;
      filler: Signer;
      side: 'yes' | 'no';
      direction: 'buy' | 'sell';
      qty: bigint;
      price: number;
      expectedYesPrice: number;
      label: string;
    }): Promise<void> {
      log.step(args.label);
      const { approvalId } = await postIntent(args.poster, {
        collectionId,
        side: args.side,
        direction: args.direction,
        tokenAmount: args.qty,
        price: args.price,
      });
      // Aggregator records the intent
      await untilAgg('aggregator records intent', () => {
        const list = listIntentsForOwner(args.poster.persona.address, collectionId).filter((i) => i.approval_id === approvalId);
        return list.length === 1 ? list[0] : null;
      });

      const approvalLevel: 'incoming' | 'outgoing' = args.direction === 'buy' ? 'incoming' : 'outgoing';
      const tokenId: 1 | 2 = args.side === 'yes' ? 1 : 2;

      await fillIntent(args.filler, {
        collectionId,
        ownerAddress: args.poster.persona.address,
        approvalId,
        approvalLevel,
        tokenId,
        tokenAmount: args.qty,
      });

      // Wait for aggregator to record the fill + emit a candle.
      await untilAgg(`headline price → ${args.expectedYesPrice}`, () => {
        const m = getMarket(collectionId);
        if (!m) return null;
        return Math.abs(m.yes_price - args.expectedYesPrice) < 0.01 ? m : null;
      });

      const market = getMarket(collectionId)!;
      assertClose(`headline yes_price after ${args.label}`, market.yes_price, args.expectedYesPrice, 0.01);
      assertClose(`headline no_price after ${args.label}`, market.no_price, 1 - args.expectedYesPrice, 0.01);

      // Latest candle's `close` should equal headline.
      const cs = listCandles(collectionId, '10m');
      assertTrue(`at least one candle present (got ${cs.length})`, cs.length >= 1);
      const last = cs[cs.length - 1];
      assertClose(`candle.close matches headline`, last.close, market.yes_price, 0.005);
      // Latest yes_price field on candle also tracks headline.
      assertClose(`candle.yes_price matches headline`, last.yes_price, market.yes_price, 0.005);
    }

    // Trade 1: alice SELL 1M YES @ 0.55 → bob buys → headline yes = 0.55
    await tradeAndVerify({
      poster: alice, filler: bob,
      side: 'yes', direction: 'sell',
      qty: 1_000_000n, price: 0.55, expectedYesPrice: 0.55,
      label: 'trade 1: alice sells YES @ 0.55',
    });

    // Trade 2: bob SELL 1M YES @ 0.45 → alice fills → headline yes = 0.45
    // (price moves down because someone sold YES cheaper)
    await tradeAndVerify({
      poster: bob, filler: alice,
      side: 'yes', direction: 'sell',
      qty: 1_000_000n, price: 0.45, expectedYesPrice: 0.45,
      label: 'trade 2: bob sells YES @ 0.45',
    });

    // Trade 3: alice BUY 1M NO @ 0.70 → bob fills (sells NO). NO trade,
    // implied YES = 1 - 0.70 = 0.30.
    await tradeAndVerify({
      poster: alice, filler: bob,
      side: 'no', direction: 'buy',
      qty: 1_000_000n, price: 0.70, expectedYesPrice: 0.30,
      label: 'trade 3: alice buys NO @ 0.70 → implies YES=0.30',
    });

    // Candle high/low should span the range we traded across.
    const all = listCandles(collectionId, '10m');
    const latest = all[all.length - 1];
    assertTrue(`candle.high ≥ 0.54 (saw 0.55) (got ${latest.high})`, latest.high >= 0.54);
    assertTrue(`candle.low ≤ 0.31 (saw 0.30) (got ${latest.low})`, latest.low <= 0.31);
  },
};

import { realtimeScenarios } from './realtime.js';
import { evmScenarios } from './evm.js';

export const ALL_SCENARIOS: Scenario[] = [
  depositAndFill,
  intentCancel,
  preSettlementRedeem,
  yesWinsScenario,
  noWinsScenario,
  pushScenario,
  priceEvolution,
  ...realtimeScenarios,
  ...evmScenarios,
];
