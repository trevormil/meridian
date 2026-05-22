import { env } from './env';

/**
 * Sparkline DataLoader — coalesces per-card requests into ONE batched HTTP
 * call, with a short-lived cache.
 *
 * Each <Sparkline> calls loadSparkline(id). Within a ~40ms window every such
 * call is collected, deduped, and flushed as a single
 * GET /predictions/sparklines?ids=… request. Results are cached for 15s so
 * scroll / tab-switch / re-render don't refetch. Net effect: a 45-card browse
 * page makes ONE request instead of 45.
 */
type Series = number[];

const CACHE_TTL_MS = 15_000;
const BATCH_WINDOW_MS = 40;

interface CacheEntry {
  data: Series;
  at: number;
}

const cache = new Map<string, CacheEntry>();
let pending = new Map<string, Array<(s: Series) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  flushTimer = null;
  const batch = pending;
  pending = new Map();
  const ids = [...batch.keys()];
  if (ids.length === 0) return;

  try {
    const r = await fetch(
      `${env.aggregatorUrl}/api/v0/predictions/sparklines?ids=${ids.join(',')}&timeframe=10m&points=24`,
    );
    const j = (await r.json()) as { sparklines?: Record<string, Series> };
    const map = j.sparklines ?? {};
    const now = Date.now();
    for (const id of ids) {
      const data = map[id] ?? [];
      cache.set(id, { data, at: now });
      for (const resolve of batch.get(id) ?? []) resolve(data);
    }
  } catch {
    // On failure, resolve everyone with empty so the UI shows the placeholder
    // rather than hanging. Don't cache failures (allow retry on next ask).
    for (const id of ids) {
      for (const resolve of batch.get(id) ?? []) resolve([]);
    }
  }
}

export function loadSparkline(id: string): Promise<Series> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Promise.resolve(hit.data);
  }
  return new Promise<Series>((resolve) => {
    const waiters = pending.get(id) ?? [];
    waiters.push(resolve);
    pending.set(id, waiters);
    if (!flushTimer) flushTimer = setTimeout(flush, BATCH_WINDOW_MS);
  });
}

/** Drop a market's cached series (e.g. after a fill) so the next ask refetches. */
export function invalidateSparkline(id: string): void {
  cache.delete(id);
}
