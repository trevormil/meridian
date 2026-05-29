import { getDb } from '../db/index.js';
import { fetchIntentsForAddress } from '../chain/intents.js';
import { syncIntentsForOwner } from '../db/intents.js';
import { getBotSigner } from '../bot/signer.js';

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
 * The bot's OWN intents are excluded: the seeder posts ~108 orders per market
 * all owned by the bot, so it accounts for ~all (owner,collection) pairs. Each
 * sync re-publishes `snapshotIntentsOwner(bot)`, which serializes the bot's
 * ENTIRE ~12k-intent book — so refreshing the bot here is O(pairs × 12k) per
 * sweep, which pegged the event loop (sweeps ran longer than their retrigger
 * interval and piled up). It's also redundant: the market-maker marks its own
 * fills `used=1` and the tx-watcher backfills chain fills. Only USER orders
 * need disappearance-detection here, and a user owns only a handful.
 */
export async function refreshAllIntents(): Promise<{ checked: number; reaped: number }> {
  const botAddr = (await getBotSigner().catch(() => null))?.address ?? null;
  const pairs = (
    botAddr
      ? getDb()
          .prepare('SELECT DISTINCT owner_address, collection_id FROM intents WHERE used = 0 AND owner_address != ?')
          .all(botAddr)
      : getDb().prepare('SELECT DISTINCT owner_address, collection_id FROM intents WHERE used = 0').all()
  ) as Array<{ owner_address: string; collection_id: string }>;

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
