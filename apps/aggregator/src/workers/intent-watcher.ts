import { getDb } from '../db/index.js';
import { fetchIntentsForAddress } from '../chain/intents.js';
import { syncIntentsForOwner } from '../db/intents.js';

/**
 * Block-tick worker that walks every (owner, collection) pair with an
 * active intent in the DB, refreshes that owner's intents from chain, and
 * flips any disappeared rows to `used=1`.
 *
 * IMPORTANT: this worker does **NOT** emit price candles. A disappeared
 * intent could be either a fill OR a manual cancel — indistinguishable from
 * the disappearance alone. The authoritative fill signal is the chain's
 * `usedApprovalDetails` event, parsed by `tx-watcher.ts → ingestEvents()`.
 * Keeping price emission solely on that path prevents cancels from polluting
 * the chart with phantom candles at the cancelled limit price.
 *
 * Sweeps EVERY owner — including the seed bot, which owns ~12k intents across
 * all markets — so consumed/cancelled orders are reaped accurately (a user can
 * trade directly against the bot's out-of-band ladder, and that bot order must
 * leave the book). This is cheap because the per-owner snapshot publish is
 * listener-guarded (`publishLazy`): nothing subscribes to `intents-owner:{bot}`,
 * so the bot's huge book is never serialized here — only the DB upsert runs.
 * (Eagerly serializing the bot book on every sync is what pegged the loop.)
 */
export async function refreshAllIntents(): Promise<{ checked: number; reaped: number }> {
  // JOIN markets and filter to active. Resolved markets can never accept new
  // fills (chain rejects), so any `used=0` intent against one is dead weight.
  // status-updater reaps intents on the flip; db/index does a one-time
  // backfill for existing data; this filter is the steady-state guard.
  const pairs = getDb()
    .prepare(
      `SELECT DISTINCT i.owner_address, i.collection_id
       FROM intents i
       JOIN markets m ON m.collection_id = i.collection_id
       WHERE i.used = 0 AND m.status = 'active'`,
    )
    .all() as Array<{ owner_address: string; collection_id: string }>;

  let reaped = 0;
  for (const { owner_address, collection_id } of pairs) {
    try {
      const live = await fetchIntentsForAddress(collection_id, owner_address);
      const disappeared = syncIntentsForOwner(owner_address, collection_id, live);
      reaped += disappeared.length;
    } catch {
      // transient — next tick will retry
    }
  }
  return { checked: pairs.length, reaped };
}
