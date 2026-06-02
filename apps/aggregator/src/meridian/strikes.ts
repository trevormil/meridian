import { STRIKE_OFFSETS } from './constants.js';

/**
 * Pick the round step so the smallest offset (±3%) can't collapse adjacent
 * strikes onto the same bucket. At a fixed $10 round, NVDA at $220 (3% ≈
 * $6.5) ended up with only 5 unique strikes instead of the intended 7.
 * Halving the round to $5 below the $333 crossover restores 7 unique strikes
 * across the price range without making high-priced names look granular.
 */
export function strikeRoundTo(prevClose: number): number {
  return prevClose * 0.03 >= 10 ? 10 : 5;
}

/**
 * Generate the set of strike prices for a stock given its previous close.
 *
 * Algorithm (per spec):
 *   1. For each offset in [-9%, -6%, -3%, 0, +3%, +6%, +9%]:
 *      strike = round(prevClose * (1 + offset), nearest strikeRoundTo(prevClose))
 *   2. Dedupe — the dynamic round step (see `strikeRoundTo`) keeps adjacent
 *      offsets in separate buckets, so callers can rely on 7 unique strikes
 *      per ticker across the full MAG7 price range.
 *
 * Returns a sorted ascending list of unique strike prices (dollars, integers).
 */
export function calculateStrikes(prevClose: number): number[] {
  if (!isFinite(prevClose) || prevClose <= 0) {
    throw new Error(`calculateStrikes: invalid prevClose ${prevClose}`);
  }
  const roundTo = strikeRoundTo(prevClose);
  const seen = new Set<number>();
  for (const off of STRIKE_OFFSETS) {
    const raw = prevClose * (1 + off);
    const rounded = Math.round(raw / roundTo) * roundTo;
    if (rounded > 0) seen.add(rounded);
  }
  return [...seen].sort((a, b) => a - b);
}
