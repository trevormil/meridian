import { getDb } from './index.js';
import type { IntentRow } from '../chain/intents.js';
import { publishLazy, channel } from '../pubsub.js';
import { snapshotIntents, snapshotIntentsOwner } from '../snapshots.js';

export function upsertIntents(rows: IntentRow[]): void {
  if (!rows.length) return;
  const now = Date.now();
  const stmt = getDb().prepare(
    `INSERT INTO intents(
       collection_id, approval_level, owner_address, approval_id,
       pay_denom, receive_denom, pay_amount, receive_amount,
       transfer_times_start, transfer_times_end, used, is_active, last_synced
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(collection_id, approval_level, owner_address, approval_id) DO UPDATE SET
       pay_denom = excluded.pay_denom,
       receive_denom = excluded.receive_denom,
       pay_amount = excluded.pay_amount,
       receive_amount = excluded.receive_amount,
       transfer_times_start = excluded.transfer_times_start,
       transfer_times_end = excluded.transfer_times_end,
       used = excluded.used,
       is_active = excluded.is_active,
       last_synced = excluded.last_synced`,
  );
  const tx = getDb().transaction((items: IntentRow[]) => {
    for (const r of items) {
      stmt.run(
        r.collectionId,
        r.approvalLevel,
        r.ownerAddress,
        r.approvalId,
        r.payDenom,
        r.receiveDenom,
        r.payAmount,
        r.receiveAmount,
        r.transferTimesStart,
        r.transferTimesEnd,
        r.used ? 1 : 0,
        r.isActive ? 1 : 0,
        now,
      );
    }
  });
  tx(rows);
  // Broadcast per-market + per-owner changes. Dedup channels to avoid
  // publishing the same collection's snapshot N times in one upsert batch.
  const cids = new Set(rows.map((r) => r.collectionId));
  const owners = new Set(rows.map((r) => r.ownerAddress));
  for (const cid of cids) publishLazy(channel.intents(cid), () => snapshotIntents(cid));
  for (const addr of owners) publishLazy(channel.intentsOwner(addr), () => snapshotIntentsOwner(addr));
}

export interface IntentDbRow {
  collection_id: string;
  approval_level: string;
  owner_address: string;
  approval_id: string;
  pay_denom: string | null;
  receive_denom: string | null;
  pay_amount: string | null;
  receive_amount: string | null;
  transfer_times_start: number | null;
  transfer_times_end: number | null;
  used: number;
  is_active: number;
}

export function listIntentsByCollection(collectionId: string, opts: { activeOnly?: boolean } = {}): IntentDbRow[] {
  const sql = opts.activeOnly
    ? 'SELECT * FROM intents WHERE collection_id = ? AND is_active = 1'
    : 'SELECT * FROM intents WHERE collection_id = ?';
  return getDb().prepare(sql).all(collectionId) as IntentDbRow[];
}

export function listIntentsByOwner(
  ownerAddress: string,
  collectionId?: string,
  opts: { includeAll?: boolean } = {},
): IntentDbRow[] {
  const filters = ['owner_address = ?'];
  const args: any[] = [ownerAddress];
  if (collectionId) {
    filters.push('collection_id = ?');
    args.push(collectionId);
  }
  if (!opts.includeAll) filters.push('is_active = 1');
  return getDb()
    .prepare(`SELECT * FROM intents WHERE ${filters.join(' AND ')}`)
    .all(...args) as IntentDbRow[];
}

/**
 * Replace an owner's intents for one collection with the current chain state.
 * Returns the DB rows for any intents that newly disappeared from chain — the
 * caller can treat these as "filled" candidates and derive a price candle.
 *
 * Note: disappearance covers BOTH fills and cancellations. The chain doesn't
 * distinguish, so callers downstream filter on "was active + not expired" to
 * separate likely fills from explicit cancels / expiry purges.
 */
export function syncIntentsForOwner(
  ownerAddress: string,
  collectionId: string,
  rows: IntentRow[],
): IntentDbRow[] {
  const seen = new Set(rows.map((r) => `${r.approvalLevel}:${r.approvalId}`));
  const existing = getDb()
    .prepare('SELECT * FROM intents WHERE owner_address = ? AND collection_id = ? AND used = 0')
    .all(ownerAddress, collectionId) as IntentDbRow[];
  const now = Date.now();
  const markUsed = getDb().prepare(
    'UPDATE intents SET used = 1, is_active = 0, last_synced = ? WHERE owner_address = ? AND collection_id = ? AND approval_level = ? AND approval_id = ?',
  );
  const disappeared: IntentDbRow[] = [];
  for (const e of existing) {
    if (!seen.has(`${e.approval_level}:${e.approval_id}`)) {
      markUsed.run(now, ownerAddress, collectionId, e.approval_level, e.approval_id);
      disappeared.push(e);
    }
  }
  upsertIntents(rows);
  // Even when nothing was upserted, a disappearance still changes the visible
  // book — publish so the FE drops the cancelled/filled row from its view.
  if (disappeared.length > 0 && rows.length === 0) {
    publishLazy(channel.intents(collectionId), () => snapshotIntents(collectionId));
    publishLazy(channel.intentsOwner(ownerAddress), () => snapshotIntentsOwner(ownerAddress));
  }
  return disappeared;
}
