/**
 * Snapshot helpers that build the same DTO shape as the REST endpoints, used
 * to push an initial payload when a client subscribes (so realtime clients
 * don't have to also fetch the REST endpoint).
 */
import { getDb } from './db/index.js';
import { listIntentsByCollection, listIntentsByOwner } from './db/intents.js';

interface MarketRow {
  collection_id: string;
  metadata_uri: string | null;
  name: string | null;
  description: string | null;
  image: string | null;
  verifier_address: string | null;
  deposit_denom: string | null;
  deposit_amount: string | null;
  pool_id: string | null;
  status: string;
  yes_price: number;
  no_price: number;
  total_deposited: string;
  resolution_date: number | null;
}

export function serializeMarketRow(r: MarketRow): unknown {
  return {
    collectionId: r.collection_id,
    metadataUri: r.metadata_uri,
    name: r.name,
    description: r.description,
    image: r.image,
    verifierAddress: r.verifier_address,
    depositDenom: r.deposit_denom,
    depositAmount: r.deposit_amount,
    poolId: r.pool_id,
    status: r.status,
    yesPrice: r.yes_price,
    noPrice: r.no_price,
    totalDeposited: r.total_deposited,
    resolutionDate: r.resolution_date,
  };
}

export function snapshotMarkets(): unknown[] {
  const rows = getDb().prepare('SELECT * FROM markets ORDER BY created_at DESC LIMIT 100').all() as MarketRow[];
  return rows.map(serializeMarketRow);
}

export function snapshotMarket(collectionId: string): unknown | null {
  const row = getDb().prepare('SELECT * FROM markets WHERE collection_id = ?').get(collectionId) as MarketRow | null;
  return row ? serializeMarketRow(row) : null;
}

function serializeIntent(r: any) {
  const FOREVER = 2_000_000_000_000_000;
  const nowMs = Date.now();
  const start = r.transfer_times_start;
  const end = r.transfer_times_end;
  const expired = end !== null && end > 0 && end < FOREVER && nowMs > end;
  return {
    collectionId: r.collection_id,
    approvalLevel: r.approval_level,
    approverAddress: r.owner_address,
    ownerAddress: r.owner_address,
    approvalId: r.approval_id,
    payDenom: r.pay_denom,
    receiveDenom: r.receive_denom,
    payAmount: r.pay_amount,
    receiveAmount: r.receive_amount,
    transferTimes: { start, end },
    used: !!r.used,
    isActive: !r.used && !expired,
    isPending: start !== null && start > 0 && start < FOREVER && nowMs < start,
    isExpired: expired,
  };
}

export function snapshotIntents(collectionId: string, activeOnly = true): unknown[] {
  return listIntentsByCollection(collectionId, { activeOnly }).map(serializeIntent);
}

export function snapshotIntentsOwner(address: string, collectionId?: string, includeAll = true): unknown[] {
  return listIntentsByOwner(address, collectionId, { includeAll }).map(serializeIntent);
}

export function snapshotCandle(collectionId: string): unknown | null {
  const row = getDb()
    .prepare(
      'SELECT ts, yes_price, no_price, open, high, low, close FROM price_history WHERE collection_id = ? AND timeframe = ? ORDER BY ts DESC LIMIT 1',
    )
    .get(collectionId, '10m') as
    | { ts: number; yes_price: number; no_price: number; open: number; high: number; low: number; close: number }
    | null;
  return row;
}

export interface FillDto {
  collectionId: string;
  approvalId: string;
  approverAddress: string;
  ts: number;
  side: 'yes' | 'no';
  tokenAmount: string;
  coinAmount: string;
  price: number;
  fromAddress: string;
  toAddress: string;
}

export function snapshotFills(collectionId: string, limit = 100): FillDto[] {
  const rows = getDb()
    .prepare(
      `SELECT collection_id, approval_id, approver_address, ts, side, token_amount, coin_amount, price, from_address, to_address
       FROM fills
       WHERE collection_id = ?
       ORDER BY ts DESC
       LIMIT ?`,
    )
    .all(collectionId, limit) as Array<{
    collection_id: string;
    approval_id: string;
    approver_address: string;
    ts: number;
    side: 'yes' | 'no';
    token_amount: string;
    coin_amount: string;
    price: number;
    from_address: string;
    to_address: string;
  }>;
  return rows.map((r) => ({
    collectionId: r.collection_id,
    approvalId: r.approval_id,
    approverAddress: r.approver_address,
    ts: r.ts,
    side: r.side,
    tokenAmount: r.token_amount,
    coinAmount: r.coin_amount,
    price: r.price,
    fromAddress: r.from_address,
    toAddress: r.to_address,
  }));
}
