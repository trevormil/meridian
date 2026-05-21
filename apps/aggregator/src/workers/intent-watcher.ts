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
 */
export async function refreshAllIntents(): Promise<{ checked: number; reaped: number }> {
  const pairs = getDb()
    .prepare('SELECT DISTINCT owner_address, collection_id FROM intents WHERE used = 0')
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
