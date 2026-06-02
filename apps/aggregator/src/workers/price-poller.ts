import { getDb, getSyncState, setSyncState } from '../db/index.js';
import { env } from '../env.js';
import { getLatestHeight } from '../chain/height.js';
import { recordCandle, updateMarketPrice, seedInitialCandles } from '../db/candles.js';
import { refreshAllIntents } from './intent-watcher.js';

interface HeartbeatMarketRow {
  collection_id: string;
  yes_price: number | null;
  no_price: number | null;
  created_at: number;
}

export async function pollPricesOnce(): Promise<void> {
  const markets = getDb()
    .prepare('SELECT collection_id, yes_price, no_price, created_at FROM markets WHERE status = ?')
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

    // Price discovery is fill-driven (recordFill on each trade) — these are
    // CLOB markets with no gamm pool. This is just a heartbeat: repeat the
    // last-known price (or the 50/50 prior) so the chart line stays continuous
    // instead of showing one stranded dot.
    const yesPrice = m.yes_price ?? 0.5;
    const noPrice = m.no_price ?? 0.5;

    recordCandle(m.collection_id, yesPrice, noPrice);
    // Only refresh the markets row's `last_synced` when the price ACTUALLY
    // moved — otherwise we'd churn the publish channel on every heartbeat.
    if (m.yes_price === null || Math.abs((m.yes_price ?? 0) - yesPrice) > 1e-6) {
      updateMarketPrice(m.collection_id, yesPrice, noPrice);
    }

    // Yield the event loop. recordCandle + updateMarketPrice are 100% sync
    // (bun:sqlite is sync by design) — without this yield, an 80+ market
    // sweep that lands on a 1m bucket boundary fires ~960 sync SQL ops +
    // ~80 WS publishes in one shot, blocking Hono long enough for Caddy to
    // drop upstream connections with EOF → 502. See deploy/Caddyfile note.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

const HEIGHT_KEY = 'price-poller.last_polled_height';

/**
 * Block-based heartbeat + fill detector. Every `pricePollEveryBlocks` blocks:
 *   1. Emit a heartbeat candle per active market (repeats last price)
 *   2. Refresh every active intent's chain state → detect fills + reap
 *      disappeared (filled/cancelled) orders
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
