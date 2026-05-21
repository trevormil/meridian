'use client';

import { env } from '@/lib/env';
import { CoinIcon } from './CoinIcon';
import { clsx } from 'clsx';

/**
 * Inline `[USDC logo] USDC` chip. Drop-in replacement for `{env.usdcSymbol}`
 * anywhere the bare symbol used to be printed. Pair with a number to get
 * "5 USDC" with a logo — or use <CoinDisplay> when you have the amount as a
 * bigint (it handles formatting + logo together).
 */
export function UsdcSymbol({
  size = 'xs',
  className,
}: {
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  return (
    <span className={clsx('inline-flex items-center gap-1 align-middle', className)}>
      <CoinIcon denom={env.usdcDenom} size={size} />
      {env.usdcSymbol}
    </span>
  );
}
