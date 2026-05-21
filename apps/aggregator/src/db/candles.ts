import { getDb } from './index.js';
import { publish, channel } from '../pubsub.js';
import { snapshotMarket, snapshotCandle } from '../snapshots.js';

const RETAIN_PER_TIMEFRAME = 125;

function bucketStart(ts: number, timeframe: '10m' | '1h' | '1d'): number {
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
  for (const tf of ['10m', '1h', '1d'] as const) {
    const bucket = bucketStart(ts, tf);
    const existing = getDb()
      .prepare('SELECT open, high, low FROM price_history WHERE collection_id = ? AND timeframe = ? AND ts = ?')
      .get(collectionId, tf, bucket) as { open: number; high: number; low: number } | undefined;
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
  // Broadcast the new candle on the per-market candle channel so subscribers
  // can append to their chart series without a refetch.
  publish(channel.candle(collectionId), snapshotCandle(collectionId));
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
