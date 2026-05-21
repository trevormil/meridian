import { getDb } from '../db/index.js';
import { env } from '../env.js';
import { getCollection } from '../chain/lcd.js';
import { upsertMarket } from './bootstrap.js';
import { publish, channel } from '../pubsub.js';
import { snapshotMarket } from '../snapshots.js';

interface MarketRow {
  collection_id: string;
  mint_escrow_address: string | null;
  deposit_denom: string | null;
}

const REFRESH_INTERVAL_MS = 10_000;

/**
 * Refresh totalDeposited for each known market by reading the bank balance of
 * its mintEscrowAddress in the market's deposit denom. Mint escrow holds the
 * full deposit pool — withdrawals decrement it as expected.
 *
 * For prediction markets backed by an IBC-wrapped coin (cosmosCoinWrapperPaths
 * non-empty), the wrapped denom balance ends up on the wrapper-path address,
 * which equals the mint escrow address in the current SDK — so the same
 * balance query covers both shapes.
 *
 * If a market row predates the mint_escrow_address column (pre-migration),
 * we re-fetch its collection from LCD here so the field gets backfilled on
 * the next pass.
 */
export async function refreshAllStats(): Promise<void> {
  const markets = getDb()
    .prepare('SELECT collection_id, mint_escrow_address, deposit_denom FROM markets')
    .all() as MarketRow[];

  for (const m of markets) {
    let escrow = m.mint_escrow_address;
    let denom = m.deposit_denom;

    if (!escrow || !denom) {
      try {
        const c = await getCollection(m.collection_id);
        if (c) {
          upsertMarket(c);
          escrow = c.mintEscrowAddress ?? null;
          // Re-read denom from the fresh row
          const row = getDb()
            .prepare('SELECT deposit_denom FROM markets WHERE collection_id = ?')
            .get(m.collection_id) as { deposit_denom: string | null } | null;
          denom = row?.deposit_denom ?? null;
        }
      } catch {
        continue;
      }
    }
    if (!escrow || !denom) continue;

    try {
      const r = await fetch(
        `${env.lcdUrl}/cosmos/bank/v1beta1/balances/${escrow}/by_denom?denom=${encodeURIComponent(denom)}`,
      );
      if (!r.ok) continue;
      const json = (await r.json()) as { balance?: { amount?: string } };
      const total = json.balance?.amount ?? '0';
      // Only emit when the value actually changed — otherwise we'd push the
      // same total on every 5s tick, spamming idle subscribers.
      const existing = getDb()
        .prepare('SELECT total_deposited FROM markets WHERE collection_id = ?')
        .get(m.collection_id) as { total_deposited?: string } | null;
      if (existing?.total_deposited === total) continue;
      getDb()
        .prepare('UPDATE markets SET total_deposited = ?, last_synced = ? WHERE collection_id = ?')
        .run(total, Date.now(), m.collection_id);
      publish(channel.market(m.collection_id), snapshotMarket(m.collection_id));
    } catch {
      // transient — retry next tick
    }
  }
}

export function startStatsPoller(): NodeJS.Timer {
  refreshAllStats().catch((e) => console.error('[stats-poller] initial:', e));
  return setInterval(() => {
    refreshAllStats().catch((e) => console.error('[stats-poller] interval:', e));
  }, REFRESH_INTERVAL_MS);
}
