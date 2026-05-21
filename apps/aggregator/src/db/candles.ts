import { getDb } from './index.js';
import { publish, channel } from '../pubsub.js';
import { snapshotMarket, snapshotCandle } from '../snapshots.js';

const RETAIN_PER_TIMEFRAME = 125;
const TIMEFRAMES = ['10m', '1h', '1d'] as const;

/**
 * In-memory cache of the last YES close we published for each (market,
 * timeframe). Drives the no-op publish guard: a heartbeat that doesn't
 * change the close skips the broadcast so we don't churn the WS for nothing.
 * `null` means "haven't published anything yet" — first observation always
 * publishes.
 */
const lastPublished = new Map<string, number>();
function lastKey(collectionId: string, timeframe: string): string {
  return `${collectionId}|${timeframe}`;
}

export function bucketStart(ts: number, timeframe: '10m' | '1h' | '1d'): number {
  const ms = timeframe === '10m' ? 600_000 : timeframe === '1h' ? 3_600_000 : 86_400_000;
  return Math.floor(ts / ms) * ms;
}

/**
 * Write a price observation into all three timeframe buckets. Maintains
 * OHLC (open + high + low + close) per bucket so the chart can be promoted
 * to candlesticks later without re-indexing. Pruning keeps each timeframe
 * to RETAIN_PER_TIMEFRAME most-recent candles (matches the indexer's policy).
 */
export function recordCandle(collectionId: string, yesPrice: number, noPrice: number, ts: number = Date.now()): void {
  let rolledOver = false;
  for (const tf of TIMEFRAMES) {
    const bucket = bucketStart(ts, tf);
    const existing = getDb()
      .prepare('SELECT open, high, low FROM price_history WHERE collection_id = ? AND timeframe = ? AND ts = ?')
      .get(collectionId, tf, bucket) as { open: number; high: number; low: number } | undefined;
    if (!existing) rolledOver = true;
    const open = existing?.open ?? yesPrice;
    const high = Math.max(existing?.high ?? yesPrice, yesPrice);
    const low = Math.min(existing?.low ?? yesPrice, yesPrice);
    getDb()
      .prepare(
        `INSERT INTO price_history(collection_id, timeframe, ts, yes_price, no_price, open, high, low, close)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(collection_id, timeframe, ts) DO UPDATE SET
           yes_price = excluded.yes_price,
           no_price = excluded.no_price,
           high = excluded.high,
           low = excluded.low,
           close = excluded.close`,
      )
      .run(collectionId, tf, bucket, yesPrice, noPrice, open, high, low, yesPrice);

    // Prune oldest candles past the retention window.
    getDb()
      .prepare(
        `DELETE FROM price_history
         WHERE collection_id = ? AND timeframe = ?
           AND ts < (SELECT MIN(ts) FROM (SELECT ts FROM price_history WHERE collection_id = ? AND timeframe = ? ORDER BY ts DESC LIMIT ?))`,
      )
      .run(collectionId, tf, collectionId, tf, RETAIN_PER_TIMEFRAME);
  }

  // No-op publish guard. Subscribers re-fetch the FULL series on push, so
  // publishing the same close every block burns CPU + bandwidth. Publish only
  // when the YES close actually moved OR a new bucket just opened (the latter
  // means a NEW data point exists even if its value matches the prior close).
  const lk = lastKey(collectionId, '10m'); // representative timeframe
  const prev = lastPublished.get(lk);
  if (rolledOver || prev === undefined || Math.abs(prev - yesPrice) > 1e-6) {
    lastPublished.set(lk, yesPrice);
    publish(channel.candle(collectionId), snapshotCandle(collectionId));
    if (rolledOver) {
      console.log(`[candle] #${collectionId} bucket roll-over → ts=${new Date(ts).toISOString()}`);
    }
  }
}

/**
 * Seed an initial 50/50 candle in each timeframe at the market's creation
 * time, so an untraded market still renders as a flat 50/50 line on the chart
 * with no client-side fabrication. INSERT OR IGNORE so re-upserts of an
 * existing market don't duplicate seeds.
 */
export function seedInitialCandles(collectionId: string, createdAt: number): void {
  for (const tf of TIMEFRAMES) {
    const bucket = bucketStart(createdAt, tf);
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO price_history
           (collection_id, timeframe, ts, yes_price, no_price, open, high, low, close)
         VALUES (?, ?, ?, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5)`,
      )
      .run(collectionId, tf, bucket);
  }
}

/**
 * Update the markets row's headline yes/no price (the chart shows history;
 * this is what the browse cards + market header render).
 */
export function updateMarketPrice(collectionId: string, yesPrice: number, noPrice: number): void {
  getDb()
    .prepare('UPDATE markets SET yes_price = ?, no_price = ?, last_synced = ? WHERE collection_id = ?')
    .run(yesPrice, noPrice, Date.now(), collectionId);
  publish(channel.market(collectionId), snapshotMarket(collectionId));
}
