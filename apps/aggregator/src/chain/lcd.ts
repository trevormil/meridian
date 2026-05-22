import { env } from '../env.js';

export interface LcdCollection {
  collectionId: string;
  standards?: string[];
  collectionMetadata?: { uri?: string; customData?: string };
  collectionApprovals?: any[];
  manager?: string;
  defaultBalances?: any;
  [k: string]: any;
}

async function lcdGet<T>(path: string): Promise<T> {
  const url = `${env.lcdUrl}${path}`;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) {
    // bitbadgeschain's LCD returns HTTP 500 with a "not found"-style message
    // for missing entities (collections, balances, votes) instead of 404.
    // We surface those as LcdNotFoundError so scanners advance past gaps.
    let body = '';
    try {
      body = await r.text();
    } catch {
      // ignore
    }
    if (r.status === 404 || looksLikeNotFound(body)) throw new LcdNotFoundError(path);
    throw new Error(`LCD ${r.status} ${r.statusText} for ${path}`);
  }
  return (await r.json()) as T;
}

function looksLikeNotFound(body: string): boolean {
  const lower = body.toLowerCase();
  // bitbadgeschain returns 500 + `{"code":2,"message":"codespace tokenization code 1502: invalid collection ID"}`
  // (or similar `invalid <thing> ID` messages) for missing entities.
  return (
    lower.includes('not found') ||
    lower.includes('does not exist') ||
    lower.includes('no such') ||
    lower.includes('invalid collection id') ||
    lower.includes('invalid balance') ||
    lower.includes('invalid vote') ||
    lower.includes('codespace tokenization')
  );
}

export class LcdNotFoundError extends Error {
  constructor(path: string) {
    super(`LCD not found for ${path}`);
  }
}

export async function getCollection(collectionId: string): Promise<LcdCollection | null> {
  try {
    const res = await lcdGet<{ collection: LcdCollection }>(
      `/bitbadges/bitbadgeschain/tokenization/get_collection/${collectionId}`,
    );
    return res.collection;
  } catch (e) {
    if (e instanceof LcdNotFoundError) return null;
    throw e;
  }
}

export async function getBalance(collectionId: string, address: string): Promise<unknown | null> {
  try {
    const res = await lcdGet<{ balance: unknown }>(
      `/bitbadges/bitbadgeschain/tokenization/get_balance/${collectionId}/${address}`,
    );
    return res.balance;
  } catch (e) {
    if (e instanceof LcdNotFoundError) return null;
    throw e;
  }
}

/** Cosmos-bank balances for an address (used for the USDC backing denom). */
export async function getBankBalances(address: string): Promise<Array<{ denom: string; amount: string }>> {
  try {
    const res = await lcdGet<{ balances: Array<{ denom: string; amount: string }> }>(
      `/cosmos/bank/v1beta1/balances/${address}?pagination.limit=1000`,
    );
    return res.balances ?? [];
  } catch (e) {
    if (e instanceof LcdNotFoundError) return [];
    throw e;
  }
}

/** Sum an address's YES (token id 1) + NO (token id 2) holdings from a
 *  tokenization balance store. Mirrors the FE sumYesNo. */
export function sumYesNo(store: unknown): { yes: bigint; no: bigint } {
  let yes = 0n;
  let no = 0n;
  const balances = (store as { balances?: Array<{ amount?: string; tokenIds?: Array<{ start: string; end: string }> }> } | null)?.balances;
  if (!balances) return { yes, no };
  for (const entry of balances) {
    const amt = BigInt(entry.amount ?? '0');
    for (const range of entry.tokenIds ?? []) {
      const s = Number(range.start);
      const e = Number(range.end);
      if (s <= 1 && e >= 1) yes += amt;
      if (s <= 2 && e >= 2) no += amt;
    }
  }
  return { yes, no };
}

export interface VoteAggregate {
  totalYesWeight: number;
  totalNoWeight: number;
  totalPossibleWeight: number;
  voters: number;
}

export async function getVotes(
  collectionId: string,
  approvalLevel: string,
  approverAddress: string,
  approvalId: string,
  proposalId: string,
): Promise<VoteAggregate | null> {
  try {
    const res = await lcdGet<{ votes?: Array<{ voter_address: string; yes_weight: string }> }>(
      `/bitbadges/bitbadgeschain/tokenization/get_votes/${collectionId}/${approvalLevel}/${approverAddress}/${approvalId}/${proposalId}`,
    );
    const votes = res.votes ?? [];
    let yes = 0;
    let no = 0;
    for (const v of votes) {
      const w = Number(v.yes_weight ?? 0);
      yes += w;
      no += 100 - w;
    }
    return {
      totalYesWeight: yes,
      totalNoWeight: no,
      totalPossibleWeight: votes.length * 100,
      voters: votes.length,
    };
  } catch (e) {
    if (e instanceof LcdNotFoundError) return null;
    throw e;
  }
}

export interface GammPool {
  id: string;
  pool_assets: Array<{ token: { denom: string; amount: string }; weight: string }>;
  [k: string]: any;
}

export async function getPool(poolId: string): Promise<GammPool | null> {
  try {
    const res = await lcdGet<{ pool: GammPool }>(`/bitbadges/bitbadgeschain/gamm/v1/pools/${poolId}`);
    return res.pool;
  } catch (e) {
    if (e instanceof LcdNotFoundError) return null;
    throw e;
  }
}
