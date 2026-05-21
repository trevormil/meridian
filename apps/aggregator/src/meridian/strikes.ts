import { STRIKE_OFFSETS, STRIKE_ROUND_TO } from './constants.js';

/**
 * Generate the set of strike prices for a stock given its previous close.
 *
 * Algorithm (per spec):
 *   1. For each offset in [-9%, -6%, -3%, 0, +3%, +6%, +9%]:
 *      strike = round(prevClose * (1 + offset), nearest $10)
 *   2. Dedupe — low-priced stocks (AAPL ~$230) collapse multiple offsets
 *      onto the same rounded value, so we end up with ~5 unique strikes
 *      instead of 7.
 *
 * Returns a sorted ascending list of unique strike prices (dollars, integers).
 */
export function calculateStrikes(prevClose: number): number[] {
  if (!isFinite(prevClose) || prevClose <= 0) {
    throw new Error(`calculateStrikes: invalid prevClose ${prevClose}`);
  }
  const seen = new Set<number>();
  for (const off of STRIKE_OFFSETS) {
    const raw = prevClose * (1 + off);
    const rounded = Math.round(raw / STRIKE_ROUND_TO) * STRIKE_ROUND_TO;
    if (rounded > 0) seen.add(rounded);
  }
  return [...seen].sort((a, b) => a - b);
}
