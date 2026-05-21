import { config } from './config.js';
import { until } from './wait.js';
import { log } from './log.js';

/**
 * Assert the local chain is up and accessible before the test runner starts
 * spawning anything else. We don't manage the chain process ourselves — the
 * user is expected to run `cr` (ignite chain serve --skip-proto --reset-once)
 * in a separate terminal. This keeps test iteration fast and matches how the
 * user already develops locally.
 */
export async function ensureChainUp(): Promise<{ chainId: string; height: number }> {
  log.step('checking chain at ' + config.lcdUrl);
  return await until(
    async () => {
      const r = await fetch(`${config.lcdUrl}/cosmos/base/tendermint/v1beta1/blocks/latest`);
      if (!r.ok) return null;
      const j = (await r.json()) as { block?: { header?: { chain_id?: string; height?: string } } };
      const chainId = j.block?.header?.chain_id ?? '';
      const height = Number(j.block?.header?.height ?? 0);
      if (!height) return null;
      log.ok(`chain ${chainId} @ height ${height}`);
      return { chainId, height };
    },
    { what: 'chain LCD', timeoutMs: 10_000 },
  );
}
