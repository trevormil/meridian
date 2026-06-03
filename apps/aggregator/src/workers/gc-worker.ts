import { getDb } from '../db/index.js';
import { env } from '../env.js';

/**
 * Garbage-collect resolved markets older than `resolvedRetentionDays`. A
 * resolved market is FINAL — its escrow drains via redeems, its votes are
 * settled, its fills are historical, and the FE just shows "YES Won" / "NO
 * Won" / "Push" forever. After ~3 days nobody is looking at it anymore.
 *
 * Keeping them around costs:
 *   - chain calls (when workers don't filter on status — see stats-poller
 *     / tx-watcher backfill / intent-watcher)
 *   - DB scans (every market list query reads through them)
 *   - SQLite size growth (~80 markets/week × ~70 fills + candles each)
 *
 * What gets deleted (cascade):
 *   - `markets` row
 *   - `price_history` (all candles for that market)
 *   - `intents` (all rows; bot ladders would otherwise pile up indefinitely)
 *   - `votes`     (the settlement votes themselves)
 *   - `fills`     (every recorded trade)
 *   - `address_collections` rows that point at that market
 *
 * Bootstrap re-discovery is safe: the bootstrap cursor (`bootstrap.last_scanned_id`)
 * has already advanced past these IDs, so a deleted resolved market won't
 * be re-indexed. Anyone navigating to /markets/<old-id> gets a 404, which is
 * the correct UX for a market that no longer exists in the aggregator.
 *
 * Disable entirely by setting MERIDIAN_RESOLVED_RETENTION_DAYS=0.
 */
export function gcResolvedMarkets(now: number = Date.now()): { deleted: number; retainDays: number } {
  const days = env.resolvedRetentionDays;
  if (days <= 0) return { deleted: 0, retainDays: 0 };

  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const db = getDb();

  // Identify victims — resolved-* status AND resolution_date older than cutoff.
  // Markets resolved BEFORE the resolution_date column was wired (pre-fix) have
  // resolution_date=NULL; for those, fall back to last_synced (which gets
  // updated on the resolution flip, so it's a safe proxy).
  const victims = db
    .prepare(
      `SELECT collection_id FROM markets
       WHERE status LIKE 'resolved-%'
         AND COALESCE(resolution_date, last_synced) < ?`,
    )
    .all(cutoff) as Array<{ collection_id: string }>;

  if (victims.length === 0) return { deleted: 0, retainDays: days };

  // Cascade-delete inside a single transaction so partial failures don't
  // leave orphaned rows.
  const ids = victims.map((v) => v.collection_id);
  const placeholders = ids.map(() => '?').join(',');
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM price_history    WHERE collection_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM intents          WHERE collection_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM votes            WHERE collection_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM fills            WHERE collection_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM address_collections WHERE collection_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM markets          WHERE collection_id IN (${placeholders})`).run(...ids);
  });
  tx();

  console.log(
    `[gc] purged ${victims.length} resolved markets older than ${days}d ` +
      `(ids: ${ids.slice(0, 5).join(',')}${ids.length > 5 ? '…' : ''})`,
  );
  return { deleted: victims.length, retainDays: days };
}

export function startGcWorker(): NodeJS.Timer | null {
  if (env.resolvedRetentionDays <= 0) {
    console.log('[gc] disabled (MERIDIAN_RESOLVED_RETENTION_DAYS=0)');
    return null;
  }
  // Run once at startup so a long-down deploy catches up immediately.
  try {
    gcResolvedMarkets();
  } catch (e) {
    console.error('[gc] initial:', e);
  }
  return setInterval(() => {
    try {
      gcResolvedMarkets();
    } catch (e) {
      console.error('[gc] interval:', e);
    }
  }, env.gcIntervalMs);
}
