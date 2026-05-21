/* eslint-disable no-console */
/**
 * Bot e2e runner. Same wiring as runner.ts but:
 *   - Sets SEED_MODE=true so the seeder posts liquidity on every new market
 *   - Runs ONLY scenarios/bot.ts (seeder verification + arbitrage execution)
 *
 * Kept separate from the main suite because the seeder + always-on arb bot
 * would mutate the order book during the existing scenarios, breaking their
 * exact-fill assertions. Run via `bun run test:e2e:bot`.
 */
import { config } from './lib/config.js';
import { log } from './lib/log.js';
import { ensureChainUp } from './lib/chain-check.js';
import { startAggregator, type AggregatorHandle } from './lib/aggregator-process.js';
import { loadPersonas } from './lib/personas.js';
import { ensureFunded } from './lib/fund.js';
import { makeSigner } from './lib/signers.js';
import { BOT_SCENARIOS } from './scenarios/bot.js';
import { AssertionError } from './lib/log.js';

interface RunResult {
  name: string;
  ok: boolean;
  durationMs: number;
  error?: Error;
}

async function main(): Promise<void> {
  let agg: AggregatorHandle | null = null;
  const results: RunResult[] = [];

  const cleanup = async (code: number): Promise<void> => {
    if (agg) {
      log.step('stopping aggregator');
      await agg.stop().catch(() => {});
    }
    process.exit(code);
  };
  process.on('SIGINT', () => cleanup(130));
  process.on('SIGTERM', () => cleanup(143));

  try {
    log.scenario('bot e2e bootstrap (SEED_MODE=true)');
    await ensureChainUp();
    const { alice, bob } = loadPersonas();
    await ensureFunded(alice, config.initialFunding);
    await ensureFunded(bob, config.initialFunding);

    // Enable SEED_MODE before spawning — the seeder reads `process.env.SEED_MODE`
    // at module init AND on each tick. The spawn helper spreads process.env into
    // the aggregator's env.
    process.env.SEED_MODE = 'true';
    agg = await startAggregator();

    const aliceSigner = await makeSigner(alice);
    const bobSigner = await makeSigner(bob);

    log.scenario('running bot scenarios');
    for (const s of BOT_SCENARIOS) {
      log.scenario(s.name);
      const start = Date.now();
      try {
        await s.run({ alice: aliceSigner, bob: bobSigner });
        const durationMs = Date.now() - start;
        log.ok(`PASS ${s.name} (${(durationMs / 1000).toFixed(1)}s)`);
        results.push({ name: s.name, ok: true, durationMs });
      } catch (e) {
        const durationMs = Date.now() - start;
        const err = e instanceof Error ? e : new Error(String(e));
        log.fail(`FAIL ${s.name}: ${err.message}`);
        if (!(e instanceof AssertionError)) console.error(err.stack);
        results.push({ name: s.name, ok: false, durationMs, error: err });
      }
    }
  } catch (e) {
    log.fail(`bootstrap failed: ${(e as Error).message}`);
    console.error((e as Error).stack);
    await cleanup(2);
    return;
  }

  console.log('\n──────── bot e2e summary ────────');
  let pass = 0;
  let fail = 0;
  for (const r of results) {
    const tag = r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${tag} ${r.name}  \x1b[2m(${(r.durationMs / 1000).toFixed(1)}s)\x1b[0m`);
    if (r.ok) pass++;
    else fail++;
  }
  console.log(`──────── ${pass} passed, ${fail} failed ────────\n`);
  await cleanup(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('uncaught:', e);
  process.exit(2);
});
