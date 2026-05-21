/**
 * SEED_MODE + arbitrage-bot scenarios. These spin up the aggregator with
 * SEED_MODE=true and verify:
 *
 *   1. Seeder posts 36 limit orders (18 buy + 18 sell) on every new market.
 *   2. Arbitrage bot fills any user-vs-user buy pair whose summed price
 *      exceeds $1 (the bot mints 1 YES + 1 NO for $1 and re-sells both at
 *      > $1 total, pocketing the spread).
 *
 * These DON'T run as part of the standard e2e suite — the seeder + bot would
 * interfere with existing scenarios that assume an empty order book and
 * verify exact fills. They run via `bun run test:e2e:bot`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../lib/config.js';
import { log, assertEq, assertTrue } from '../lib/log.js';
import { sleep, until } from '../lib/wait.js';
import { postIntent } from '../lib/txs.js';
import { getYesNoBalance, getBankBalance } from '../lib/queries.js';
import { bootstrapMarket } from './index.js';
import type { Scenario } from './index.js';

const BOT_FIXTURE = resolve(import.meta.dir, '../../../fixtures/bot.json');

function loadBotAddress(): string {
  if (!existsSync(BOT_FIXTURE)) throw new Error(`bot fixture missing: ${BOT_FIXTURE}`);
  const fx = JSON.parse(readFileSync(BOT_FIXTURE, 'utf8')) as { address: string };
  return fx.address;
}

async function listIntents(collectionId: string): Promise<any[]> {
  const r = await fetch(`${config.aggregatorUrl}/api/v0/intents?collectionId=${collectionId}`);
  if (!r.ok) return [];
  const j = (await r.json()) as { intents?: any[] };
  return j.intents ?? [];
}

async function listOwnerIntents(address: string, collectionId: string): Promise<any[]> {
  const r = await fetch(
    `${config.aggregatorUrl}/api/v0/intents/${address}?collectionId=${collectionId}&includeAll=true`,
  );
  if (!r.ok) return [];
  const j = (await r.json()) as { intents?: any[] };
  return j.intents ?? [];
}

export const seederScenario: Scenario = {
  name: 'SEED_MODE: bot seeds 36 limit orders on every new market',
  async run({ alice }) {
    const botAddress = loadBotAddress();
    log.step('alice creates a fresh market — seeder should fire automatically');
    const { collectionId } = await bootstrapMarket(alice, `e2e-seed-${Date.now()}`);

    // Seeder runs on listen(channel.markets()) AND on a startup scan. After
    // the market lands in DB it should fire within a second. We poll up to
    // 30s for the 36 expected intents because the deposit-then-orders flow
    // is two sequential txs.
    // The seeder posts a grid of (prices × quantities × yes/no × buy/sell).
    // Currently: 9 prices × 3 sizes × 4 dirs = 108 intents per market.
    const EXPECTED = 108;
    log.step(`waiting for seeder to post ${EXPECTED} intents on bot ${botAddress.slice(0, 12)}…`);
    const intents = await until(
      async () => {
        const all = await listOwnerIntents(botAddress, collectionId);
        return all.length >= EXPECTED ? all : null;
      },
      { what: `seeder posts ${EXPECTED} intents`, timeoutMs: 60_000, intervalMs: 2_000 },
    );

    const incoming = intents.filter((i) => i.approvalLevel === 'incoming');
    const outgoing = intents.filter((i) => i.approvalLevel === 'outgoing');
    assertEq('half are buy (incoming)', incoming.length, EXPECTED / 2);
    assertEq('half are sell (outgoing)', outgoing.length, EXPECTED / 2);

    const prices = intents.map((i) => {
      const payIsTok = String(i.payDenom ?? '').startsWith('badgeslp:');
      const tokenAmt = Number(payIsTok ? i.payAmount : i.receiveAmount);
      const coinAmt = Number(payIsTok ? i.receiveAmount : i.payAmount);
      const side = (payIsTok ? i.payDenom : i.receiveDenom).endsWith(':uyes') ? 'yes' : 'no';
      return { side, level: i.approvalLevel as 'incoming' | 'outgoing', price: coinAmt / tokenAmt };
    });
    const buyYes = prices.filter((p) => p.level === 'incoming' && p.side === 'yes');
    const buyNo = prices.filter((p) => p.level === 'incoming' && p.side === 'no');
    const sellYes = prices.filter((p) => p.level === 'outgoing' && p.side === 'yes');
    const sellNo = prices.filter((p) => p.level === 'outgoing' && p.side === 'no');
    // 9 prices × 3 sizes per (side × direction)
    assertEq('27 buy YES intents', buyYes.length, 27);
    assertEq('27 buy NO intents', buyNo.length, 27);
    assertEq('27 sell YES intents', sellYes.length, 27);
    assertEq('27 sell NO intents', sellNo.length, 27);

    const maxBuySum = Math.max(...buyYes.map((y) => y.price)) + Math.max(...buyNo.map((n) => n.price));
    const minSellSum = Math.min(...sellYes.map((y) => y.price)) + Math.min(...sellNo.map((n) => n.price));
    assertTrue(`max buy_yes + buy_no = ${maxBuySum.toFixed(2)} ≤ 1 (no internal arb)`, maxBuySum <= 1.001);
    assertTrue(`min sell_yes + sell_no = ${minSellSum.toFixed(2)} ≥ 1 (no internal arb)`, minSellSum >= 0.999);
  },
};

export const arbitrageScenario: Scenario = {
  name: 'arbitrage bot: fills user buy_YES + buy_NO when sum > $1',
  async run({ alice }) {
    const botAddress = loadBotAddress();
    log.step('bootstrap + wait for seeder');
    const { collectionId } = await bootstrapMarket(alice, `e2e-arb-${Date.now()}`);
    await until(
      async () => {
        const all = await listOwnerIntents(botAddress, collectionId);
        return all.length >= 108 ? true : null;
      },
      { what: 'seed', timeoutMs: 60_000, intervalMs: 2_000 },
    );

    // Snapshot starting balances. We measure alice's UI-visible position
    // (YES/NO + USDC) plus the bot's USDC, then expect:
    //   alice  YES/NO +1 each, USDC -1.6
    //   bot    USDC +0.6  (net of mint cost vs sale proceeds; protocol fee is
    //                       disabled per chore/disable-protocol-fee-local PR)
    const aliceBefore = await getYesNoBalance(collectionId, alice.persona.address);
    const aliceUsdcBefore = await getBankBalance(alice.persona.address, config.usdcDenom);
    const botUsdcBefore = await getBankBalance(botAddress, config.usdcDenom);

    log.step('alice posts BUY YES + BUY NO @ 0.80 — creates a sum=1.60 arb');
    const QTY = 1_000_000n;
    await postIntent(alice, {
      collectionId,
      side: 'yes',
      direction: 'buy',
      tokenAmount: QTY,
      price: 0.8,
    });
    await postIntent(alice, {
      collectionId,
      side: 'no',
      direction: 'buy',
      tokenAmount: QTY,
      price: 0.8,
    });
    await sleep(1500);

    // Arb bot scans every 5s. Give it up to ~25s for the tick + the mint +
    // fill batched tx + commit + sync.
    log.step('waiting for arb bot to fire…');
    await until(
      async () => {
        const mine = await listOwnerIntents(alice.persona.address, collectionId);
        // Each scenario uses a fresh collectionId so the only intents alice
        // owns here are the two we just posted. When both flip to used=true
        // (filled by the arb bot), the arb succeeded.
        const active = mine.filter((i) => i.isActive && i.approvalLevel === 'incoming');
        return active.length === 0 ? true : null;
      },
      { what: 'arb fills both alice intents', timeoutMs: 30_000, intervalMs: 1_500 },
    );
    await sleep(2000); // let chain + aggregator + balance queries settle

    const aliceAfter = await getYesNoBalance(collectionId, alice.persona.address);
    const aliceUsdcAfter = await getBankBalance(alice.persona.address, config.usdcDenom);
    const botUsdcAfter = await getBankBalance(botAddress, config.usdcDenom);

    assertEq('alice YES += 1', aliceAfter.yes, aliceBefore.yes + QTY);
    assertEq('alice NO  += 1', aliceAfter.no, aliceBefore.no + QTY);

    // alice spent 1.6 USDC across the two filled buys (each was 0.8 USDC × 1 token).
    const aliceSpent = aliceUsdcBefore - aliceUsdcAfter;
    assertTrue(
      `alice spent ~1.6 USDC (got ${aliceSpent})`,
      aliceSpent >= 1_500_000n && aliceSpent <= 1_700_000n,
    );

    // Bot net: spent 1 USDC on the deposit-to-mint, received 1.6 USDC from the
    // two fills. Subtract a small allowance for gas (BADGE, not USDC) — gas is
    // paid in ubadge so it does NOT affect USDC balance.
    const botGained = botUsdcAfter - botUsdcBefore;
    assertTrue(
      `bot net USDC gain ≈ 0.6 (got ${botGained})`,
      botGained >= 500_000n && botGained <= 700_000n,
    );
    log.ok(`arb executed: alice spent ${aliceSpent}, bot gained ${botGained}`);
  },
};

export const BOT_SCENARIOS: Scenario[] = [seederScenario, arbitrageScenario];
