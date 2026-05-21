import { getDb, getSyncState, setSyncState } from '../db/index.js';
import { env } from '../env.js';
import { getPool } from '../chain/lcd.js';
import { getLatestHeight } from '../chain/height.js';
import { recordCandle, updateMarketPrice } from '../db/candles.js';
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

export async function pollPricesOnce(): Promise<void> {
  const markets = getDb()
    .prepare('SELECT collection_id, pool_id FROM markets WHERE status = ?')
    .all('active') as MarketRow[];

  for (const m of markets) {
    if (!m.pool_id) continue;
    try {
      const pool = await getPool(m.pool_id);
      if (!pool) continue;
      const yes = pool.pool_assets.find((p) => p.token.denom === yesDenom(m.collection_id));
      const no = pool.pool_assets.find((p) => p.token.denom === noDenom(m.collection_id));
      if (!yes || !no) continue;
      const yReserve = Number(yes.token.amount);
      const nReserve = Number(no.token.amount);
      const total = yReserve + nReserve;
      if (total <= 0) continue;
      // YES price = NO_reserve / (YES + NO). Higher NO supply implies cheaper NO and pricier YES.
      const yesPrice = nReserve / total;
      const noPrice = yReserve / total;
      recordCandle(m.collection_id, yesPrice, noPrice);
      updateMarketPrice(m.collection_id, yesPrice, noPrice);
    } catch (err) {
      console.warn(`[price-poller] ${m.collection_id}:`, (err as Error).message);
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
