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
 *
 * Only ACTIVE markets are polled — escrow on resolved markets is drained by
 * redeems and won't change in a user-visible way (the FE shows them as final
 * either way). Combined with the event-driven `refreshOneStat` hook called
 * from tx-watcher.recordFill, this keeps post-deposit freshness sub-block
 * while cutting steady-state chain RPS from ~9/sec to ~0.1/sec.
 */
export async function refreshAllStats(): Promise<void> {
  const markets = getDb()
    .prepare(
      "SELECT collection_id, mint_escrow_address, deposit_denom FROM markets WHERE status = 'active'",
    )
    .all() as MarketRow[];

  for (const m of markets) {
    await refreshOneStatRow(m);
  }
}

/**
 * Refresh a single market's totalDeposited. Used both by the steady-state
 * sweep and by the event-driven hook from tx-watcher.recordFill — when a
 * fill that includes a deposit msg lands, we recheck escrow immediately
 * instead of waiting up to `statsPollIntervalMs` for the next sweep.
 *
 * Resolved markets are intentionally NOT skipped here — a fill on a resolved
 * market would be a chain bug, but the safety hook should still update DB
 * state honestly if one ever happens.
 */
export async function refreshOneStat(collectionId: string): Promise<void> {
  const row = getDb()
    .prepare('SELECT collection_id, mint_escrow_address, deposit_denom FROM markets WHERE collection_id = ?')
    .get(collectionId) as MarketRow | undefined;
  if (!row) return;
  await refreshOneStatRow(row);
}

async function refreshOneStatRow(m: MarketRow): Promise<void> {
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
      return;
    }
  }
  if (!escrow || !denom) return;

  try {
    const r = await fetch(
      `${env.lcdUrl}/cosmos/bank/v1beta1/balances/${escrow}/by_denom?denom=${encodeURIComponent(denom)}`,
    );
    if (!r.ok) return;
    const json = (await r.json()) as { balance?: { amount?: string } };
    const total = json.balance?.amount ?? '0';
    // Only emit when the value actually changed — otherwise we'd push the
    // same total on every tick, spamming idle subscribers.
    const existing = getDb()
      .prepare('SELECT total_deposited FROM markets WHERE collection_id = ?')
      .get(m.collection_id) as { total_deposited?: string } | null;
    if (existing?.total_deposited === total) return;
    getDb()
      .prepare('UPDATE markets SET total_deposited = ?, last_synced = ? WHERE collection_id = ?')
      .run(total, Date.now(), m.collection_id);
    publish(channel.market(m.collection_id), snapshotMarket(m.collection_id));
  } catch {
    // transient — retry next tick
  }
}

export function startStatsPoller(): NodeJS.Timer {
  refreshAllStats().catch((e) => console.error('[stats-poller] initial:', e));
  return setInterval(() => {
    refreshAllStats().catch((e) => console.error('[stats-poller] interval:', e));
  }, env.statsPollIntervalMs);
}
