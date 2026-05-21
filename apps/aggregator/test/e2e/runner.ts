/* eslint-disable no-console */
/**
 * E2E test runner.
 *
 * Prereq: a local chain is running (run `cr` in another terminal). The runner
 * connects to it, spawns a fresh aggregator on a side port (4042) with a
 * separate data dir, then walks every scenario in apps/aggregator/test/e2e/
 * scenarios/index.ts.
 *
 * On exit (success or fail) the aggregator is killed and its sqlite WAL closes.
 */
import { config } from './lib/config.js';
import { log } from './lib/log.js';
import { ensureChainUp } from './lib/chain-check.js';
import { startAggregator, type AggregatorHandle } from './lib/aggregator-process.js';
import { loadPersonas } from './lib/personas.js';
import { ensureFunded } from './lib/fund.js';
import { makeSigner } from './lib/signers.js';
import { ALL_SCENARIOS } from './scenarios/index.js';
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

  // Always clean up the aggregator process even on unhandled errors.
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
    log.scenario('e2e bootstrap');
    await ensureChainUp();

    const { alice, bob } = loadPersonas();
    log.info(`alice = ${alice.address}`);
    log.info(`bob   = ${bob.address}`);

    // Ensure both personas have funds (no-op if seeded via config.yml + reset).
    await ensureFunded(alice, config.initialFunding);
    await ensureFunded(bob, config.initialFunding);

    // Aggregator must be running before the signers — the SDK signing client
    // posts simulate + broadcast to its proxy.
    agg = await startAggregator();

    const aliceSigner = await makeSigner(alice);
    const bobSigner = await makeSigner(bob);

    log.scenario('running scenarios');
    for (const s of ALL_SCENARIOS) {
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

  // ───────────────────────── Summary ─────────────────────────
  console.log('\n──────── e2e summary ────────');
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
