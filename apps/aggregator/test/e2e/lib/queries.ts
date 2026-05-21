import { Database } from 'bun:sqlite';
import { resolve } from 'node:path';
import { config } from './config.js';

/** Open a read-only handle to the aggregator's e2e database. */
export function openDb(): Database {
  return new Database(resolve(config.aggregatorDbDir, 'aggregator.sqlite'), { readonly: true });
}

// ───────────────────────── Aggregator DB queries ─────────────────────────

export interface MarketRow {
  collection_id: string;
  name: string | null;
  status: string;
  yes_price: number;
  no_price: number;
  total_deposited: string;
  mint_escrow_address: string | null;
  verifier_address: string | null;
  deposit_denom: string | null;
}

export function getMarket(collectionId: string): MarketRow | null {
  const db = openDb();
  try {
    return (db.query('SELECT * FROM markets WHERE collection_id = ?').get(collectionId) as MarketRow | null) ?? null;
  } finally {
    db.close();
  }
}

export interface IntentRow {
  collection_id: string;
  approval_level: 'incoming' | 'outgoing';
  owner_address: string;
  approval_id: string;
  pay_denom: string | null;
  receive_denom: string | null;
  pay_amount: string | null;
  receive_amount: string | null;
  used: number;
  is_active: number;
}

export function listIntents(collectionId: string): IntentRow[] {
  const db = openDb();
  try {
    return db.query('SELECT * FROM intents WHERE collection_id = ?').all(collectionId) as IntentRow[];
  } finally {
    db.close();
  }
}

export function listIntentsForOwner(ownerAddress: string, collectionId?: string): IntentRow[] {
  const db = openDb();
  try {
    if (collectionId) {
      return db.query('SELECT * FROM intents WHERE owner_address = ? AND collection_id = ?').all(ownerAddress, collectionId) as IntentRow[];
    }
    return db.query('SELECT * FROM intents WHERE owner_address = ?').all(ownerAddress) as IntentRow[];
  } finally {
    db.close();
  }
}

export interface PriceCandle {
  ts: number;
  yes_price: number;
  no_price: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function listCandles(collectionId: string, timeframe: '10m' | '1h' | '1d' = '10m'): PriceCandle[] {
  const db = openDb();
  try {
    return db
      .query('SELECT * FROM price_history WHERE collection_id = ? AND timeframe = ? ORDER BY ts ASC')
      .all(collectionId, timeframe) as PriceCandle[];
  } finally {
    db.close();
  }
}

// ──────────────────────────── Chain LCD queries ───────────────────────────

export async function getCollectionFromChain(collectionId: string): Promise<any | null> {
  const r = await fetch(`${config.lcdUrl}/bitbadges/bitbadgeschain/tokenization/get_collection/${collectionId}`);
  if (!r.ok) return null;
  return ((await r.json()) as { collection: any }).collection;
}

export async function getUserBalanceFromChain(collectionId: string, address: string): Promise<any | null> {
  const r = await fetch(`${config.lcdUrl}/bitbadges/bitbadgeschain/tokenization/get_balance/${collectionId}/${address}`);
  if (!r.ok) return null;
  return ((await r.json()) as { balance: any }).balance;
}

export async function getBankBalance(address: string, denom: string): Promise<bigint> {
  const r = await fetch(`${config.lcdUrl}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${encodeURIComponent(denom)}`);
  if (!r.ok) return 0n;
  const j = (await r.json()) as { balance?: { amount?: string } };
  return BigInt(j.balance?.amount ?? '0');
}

/**
 * Sum YES (token 1) and NO (token 2) holdings out of a UserBalanceStore
 * `balances` array. Range entries like `[1..2]` cover both tokens with one
 * amount; split-out post-trade entries are summed per token.
 */
export function yesNoFromStore(store: any | null): { yes: bigint; no: bigint } {
  let yes = 0n;
  let no = 0n;
  for (const entry of store?.balances ?? []) {
    const amt = BigInt(entry.amount ?? '0');
    for (const r of entry.tokenIds ?? []) {
      const s = Number(r.start);
      const e = Number(r.end);
      if (s <= 1 && e >= 1) yes += amt;
      if (s <= 2 && e >= 2) no += amt;
    }
  }
  return { yes, no };
}

export async function getYesNoBalance(collectionId: string, address: string): Promise<{ yes: bigint; no: bigint }> {
  const store = await getUserBalanceFromChain(collectionId, address);
  return yesNoFromStore(store);
}
