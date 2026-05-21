'use client';

import { getBankBalances, getUserBalance, type Coin } from '@/lib/chain/lcd';

export interface MarketBalances {
  yes: bigint;
  no: bigint;
  usdc: bigint;
}

export function yesDenom(collectionId: string): string {
  return `badgeslp:${collectionId}:uyes`;
}
export function noDenom(collectionId: string): string {
  return `badgeslp:${collectionId}:uno`;
}

/**
 * `badgeslp:*:uyes|uno` are tokenization-module aliases — they do NOT live in
 * cosmos-bank. So YES/NO holdings come from the tokenization get_balance
 * endpoint (UserBalanceStore), while the USDC deposit denom (an IBC coin) is
 * a real bank denom.
 *
 * UserBalanceStore stores per-user balances as `{amount, tokenIds: [start..end]}`
 * entries. A user with equal YES + NO collapses to a single `[1..2]` entry;
 * unequal balances split into separate `[1..1]` / `[2..2]` entries. We walk
 * the array and sum coverage per token id.
 */
export async function getMarketBalances(address: string, collectionId: string, usdcDenom: string): Promise<MarketBalances> {
  const [bank, store] = await Promise.all([getBankBalances(address), getUserBalance(collectionId, address)]);
  const usdc = BigInt(bank.find((b: Coin) => b.denom === usdcDenom)?.amount ?? '0');
  return { ...sumYesNo(store), usdc };
}

export function sumYesNo(store: any | null): { yes: bigint; no: bigint } {
  let yes = 0n;
  let no = 0n;
  if (!store?.balances) return { yes, no };
  for (const entry of store.balances) {
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
