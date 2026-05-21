import { env } from '../env';

/**
 * All chain reads go through the aggregator. It proxies /cosmos/* and
 * /bitbadges/* to LCD (CORS-friendly) and absorbs LCD 500s on missing
 * accounts/balances, returning empty shapes instead of throwing.
 */
async function lcd<T>(path: string): Promise<T> {
  const r = await fetch(`${env.aggregatorUrl}${path}`, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`chain ${r.status} ${path}`);
  return (await r.json()) as T;
}

export interface Coin {
  denom: string;
  amount: string;
}

export async function getBankBalances(address: string): Promise<Coin[]> {
  const res = await lcd<{ balances: Coin[] }>(`/cosmos/bank/v1beta1/balances/${address}`);
  return res.balances ?? [];
}

export async function getBankBalance(address: string, denom: string): Promise<bigint> {
  const balances = await getBankBalances(address);
  const c = balances.find((b) => b.denom === denom);
  return BigInt(c?.amount ?? '0');
}

export async function getCollection(collectionId: string): Promise<any | null> {
  try {
    const res = await lcd<{ collection: any }>(`/bitbadges/bitbadgeschain/tokenization/get_collection/${collectionId}`);
    return res.collection;
  } catch (e) {
    return null;
  }
}

export async function getUserBalance(collectionId: string, address: string): Promise<any | null> {
  try {
    const res = await lcd<{ balance: any }>(
      `/bitbadges/bitbadgeschain/tokenization/get_balance/${collectionId}/${address}`,
    );
    return res.balance;
  } catch (e) {
    return null;
  }
}

export async function getAccount(address: string): Promise<{ accountNumber: bigint; sequence: bigint } | null> {
  try {
    const res = await lcd<{
      account: {
        '@type': string;
        base_account?: { account_number: string; sequence: string };
        account_number?: string;
        sequence?: string;
      };
    }>(`/cosmos/auth/v1beta1/accounts/${address}`);
    const a = res.account;
    const an = a.base_account?.account_number ?? a.account_number;
    const sq = a.base_account?.sequence ?? a.sequence;
    if (!an || !sq) return null;
    return { accountNumber: BigInt(an), sequence: BigInt(sq) };
  } catch {
    return null;
  }
}
