'use client';

import { clsx } from 'clsx';
import { useState } from 'react';
import { coinInfo, type CoinInfo } from '@/lib/coins';

interface Props {
  denom: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizePx = { xs: 16, sm: 20, md: 28, lg: 40 } as const;
const sizeBox = {
  xs: 'h-4 w-4 text-[8px]',
  sm: 'h-5 w-5 text-[9px]',
  md: 'h-7 w-7 text-[10px]',
  lg: 'h-10 w-10 text-xs',
} as const;

const accentMap: Record<CoinInfo['accent'], string> = {
  yes: 'bg-yes/15 text-yes border-yes/40',
  no: 'bg-no/15 text-no border-no/40',
  usdc: 'bg-[#2775ca]/15 text-[#2775ca] border-[#2775ca]/40',
  badge: 'bg-accent/15 text-accent border-accent/40',
};

/**
 * Round coin avatar. Uses a plain <img> for known local assets (avoids the
 * next/image runtime + the optimizer path), and falls back to a colored
 * monogram chip on load error or when no image is registered.
 */
export function CoinIcon({ denom, size = 'md', className }: Props) {
  const info = coinInfo(denom);
  const [errored, setErrored] = useState(false);
  const px = sizePx[size];

  if (info.image && !errored) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return (
      <img
        src={info.image}
        alt={info.symbol}
        width={px}
        height={px}
        loading="eager"
        onError={() => setErrored(true)}
        className={clsx(
          sizeBox[size],
          'inline-block shrink-0 rounded-full border border-border bg-bg object-contain align-middle',
          className,
        )}
      />
    );
  }
  return (
    <span
      className={clsx(
        sizeBox[size],
        'inline-flex shrink-0 items-center justify-center rounded-full border align-middle font-bold uppercase tracking-tighter',
        accentMap[info.accent],
        className,
      )}
    >
      {info.symbol.slice(0, info.symbol.length > 3 ? 2 : info.symbol.length)}
    </span>
  );
}
