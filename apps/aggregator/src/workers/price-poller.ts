import { getDb, getSyncState, setSyncState } from '../db/index.js';
import { env } from '../env.js';
import { getPool } from '../chain/lcd.js';
import { getLatestHeight } from '../chain/height.js';
import { recordCandle, updateMarketPrice, seedInitialCandles } from '../db/candles.js';
import { refreshAllIntents } from './intent-watcher.js';

interface MarketRow {
  collection_id: string;
  pool_id: string | null;
}

function yesDenom(collectionId: string): string {
  return `badgeslp:${collectionId}:uyes`;
}
function noDenom(collectionId: string): string {
  return `badgeslp:${collectionId}:uno`;
}

interface HeartbeatMarketRow extends MarketRow {
  yes_price: number | null;
  no_price: number | null;
  created_at: number;
}

export async function pollPricesOnce(): Promise<void> {
  const markets = getDb()
    .prepare(
      'SELECT collection_id, pool_id, yes_price, no_price, created_at FROM markets WHERE status = ?',
    )
    .all('active') as HeartbeatMarketRow[];

  for (const m of markets) {
    // Self-heal: backfill the initial 50/50 seed for markets indexed before
    // seedInitialCandles was wired into upsertMarket. One-time per market;
    // INSERT OR IGNORE makes the call cheap when the seed already exists.
    const hasAnyCandle = getDb()
      .prepare('SELECT 1 FROM price_history WHERE collection_id = ? LIMIT 1')
      .get(m.collection_id);
    if (!hasAnyCandle) {
      seedInitialCandles(m.collection_id, m.created_at);
    }
    let yesPrice: number | null = null;
    let noPrice: number | null = null;

    // Prefer pool-derived price when a gamm pool exists for this market.
    if (m.pool_id) {
      try {
        const pool = await getPool(m.pool_id);
        if (pool) {
          const yes = pool.pool_assets.find((p) => p.token.denom === yesDenom(m.collection_id));
          const no = pool.pool_assets.find((p) => p.token.denom === noDenom(m.collection_id));
          if (yes && no) {
            const yReserve = Number(yes.token.amount);
            const nReserve = Number(no.token.amount);
            const total = yReserve + nReserve;
            if (total > 0) {
              yesPrice = nReserve / total;
              noPrice = yReserve / total;
            }
          }
        }
      } catch (err) {
        console.warn(`[price-poller] ${m.collection_id} pool fetch:`, (err as Error).message);
      }
    }

    // Heartbeat fallback: when there's no pool (intent-only markets) or the
    // pool fetch failed, repeat the last-known price so the chart shows a
    // continuous line instead of one stranded dot. Defaults to 50/50 prior
    // when the market has never had a trade.
    if (yesPrice === null || noPrice === null) {
      yesPrice = m.yes_price ?? 0.5;
      noPrice = m.no_price ?? 0.5;
    }

    recordCandle(m.collection_id, yesPrice, noPrice);
    // Only refresh the markets row's `last_synced` when the price ACTUALLY
    // moved — otherwise we'd churn the publish channel on every heartbeat.
    if (m.yes_price === null || Math.abs((m.yes_price ?? 0) - yesPrice) > 1e-6) {
      updateMarketPrice(m.collection_id, yesPrice, noPrice);
    }
  }
}

const HEIGHT_KEY = 'price-poller.last_polled_height';

/**
 * Block-based price + fill detector. Every `pricePollEveryBlocks` blocks:
 *   1. Snapshot gamm pool reserves → candle (for markets with a pool)
 *   2. Refresh every active intent's chain state → detect fills → emit
 *      candle at the implied trade price
 *
 * Wall-clock decoupled — when the chain is paused, no fake candles get
 * written. When the chain accelerates (catch-up), we still cap at one tick
 * per `pricePollEveryBlocks` advanced.
 */
export function startPricePoller(): NodeJS.Timer {
  // Fire both once on boot so charts aren't empty for the first ~15s.
  pollPricesOnce().catch((e) => console.error('[price-poller] initial pool poll:', e));
  refreshAllIntents().catch((e) => console.error('[intent-watcher] initial sweep:', e));

  return setInterval(async () => {
    try {
      const current = await getLatestHeight();
      if (current === null) return;
      const last = Number(getSyncState(HEIGHT_KEY) ?? '0');
      if (last && current - last < env.pricePollEveryBlocks) return;
      await pollPricesOnce();
      const { checked, reaped } = await refreshAllIntents();
      if (reaped > 0) console.log(`[block-tick] height=${current} pools polled, intents=${checked} disappeared=${reaped}`);
      setSyncState(HEIGHT_KEY, String(current));
    } catch (e) {
      console.error('[price-poller] tick:', e);
    }
  }, env.blockCheckIntervalMs);
}
