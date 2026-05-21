import { env } from './env';

export interface CoinInfo {
  symbol: string;
  decimals: number;
  image: string | null;
  /** Tailwind color for accent (text/border). */
  accent: 'yes' | 'no' | 'usdc' | 'badge';
}

/**
 * Small registry mirroring the SDK's CoinsRegistry but trimmed to the denoms
 * we actually display. Resolution order: prediction-market YES/NO alias
 * (per-collection) → known stables → env fallback.
 */
const STATIC: Record<string, CoinInfo> = {
  // USDC (Noble via Circle)
  'ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349': {
    symbol: 'USDC',
    decimals: 6,
    image: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/noble/images/USDCoin.png',
    accent: 'usdc',
  },
  ubadge: {
    symbol: 'BADGE',
    decimals: 9,
    image: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/bitbadges/images/badge_logo.png',
    accent: 'badge',
  },
};

export function coinInfo(denom: string | null | undefined): CoinInfo {
  if (!denom) return { symbol: '?', decimals: 0, image: null, accent: 'badge' };
  if (denom.endsWith(':uyes')) {
    return { symbol: 'YES', decimals: env.usdcDecimals, image: null, accent: 'yes' };
  }
  if (denom.endsWith(':uno')) {
    return { symbol: 'NO', decimals: env.usdcDecimals, image: null, accent: 'no' };
  }
  if (STATIC[denom]) return STATIC[denom];
  if (denom === env.usdcDenom) return STATIC['ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349'];
  // Unknown — show truncated denom.
  return {
    symbol: denom.length > 12 ? `${denom.slice(0, 6)}…` : denom,
    decimals: 6,
    image: null,
    accent: 'badge',
  };
}

export function formatAmount(baseAmount: bigint | string | number, decimals: number, sigDigits = 4): string {
  const big = BigInt(baseAmount);
  if (decimals === 0) return big.toString();
  const div = BigInt(10) ** BigInt(decimals);
  const whole = big / div;
  const frac = big % div;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, sigDigits).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export function parseAmount(displayAmount: string, decimals: number): bigint {
  if (!displayAmount || displayAmount === '.') return 0n;
  const [whole = '0', frac = ''] = displayAmount.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole || '0') * BigInt(10) ** BigInt(decimals) + BigInt(padded || '0');
}
