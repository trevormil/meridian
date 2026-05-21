import { env } from '../env.js';

/**
 * Read the chain's latest committed block height via LCD. Returns null on
 * any transport error so callers can no-op until the next poll instead of
 * crashing the worker loop.
 */
export async function getLatestHeight(): Promise<number | null> {
  try {
    const r = await fetch(`${env.lcdUrl}/cosmos/base/tendermint/v1beta1/blocks/latest`, {
      headers: { accept: 'application/json' },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { block?: { header?: { height?: string } } };
    const h = j.block?.header?.height;
    return h ? Number(h) : null;
  } catch {
    return null;
  }
}
