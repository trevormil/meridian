'use client';

import Image from 'next/image';
import { clsx } from 'clsx';
import { env } from '@/lib/env';

interface Props {
  /** Coin denom or symbol. Currently recognizes the USDC IBC denom and 'USDC'. */
  denom?: string;
  size?: number;
  className?: string;
}

/**
 * Coin logo. USDC ships with a known asset; other denoms fall back to a
 * monogram chip with the first 4 chars of the denom (after stripping the
 * `ibc/`/`badgeslp:` prefix).
 */
export function CoinLogo({ denom, size = 16, className }: Props) {
  const usdcMatches =
    !denom ||
    denom === 'USDC' ||
    denom === env.usdcSymbol ||
    denom === env.usdcDenom;

  if (usdcMatches) {
    return (
      <Image
        src="/coins/usdc.png"
        alt="USDC"
        title="USDC"
        width={size}
        height={size}
        className={clsx('inline-block rounded-full', className)}
        unoptimized
      />
    );
  }

  // YES/NO token monograms — read from badgeslp:{cid}:uyes / uno.
  const yesNo = /^badgeslp:\d+:(uyes|uno)$/.exec(denom ?? '');
  if (yesNo) {
    const isYes = yesNo[1] === 'uyes';
    return (
      <span
        className={clsx(
          'inline-flex items-center justify-center rounded-full border text-[9px] font-bold',
          isYes ? 'border-yes/50 bg-yes/15 text-yes' : 'border-no/50 bg-no/15 text-no',
          className,
        )}
        style={{ width: size, height: size }}
        title={isYes ? 'YES token' : 'NO token'}
      >
        {isYes ? 'Y' : 'N'}
      </span>
    );
  }

  // Generic fallback.
  const monogram = (denom ?? '?').replace(/^(ibc\/|badgeslp:)/, '').slice(0, 2).toUpperCase();
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-full border border-border bg-panel-2 text-[9px] font-bold text-muted',
        className,
      )}
      style={{ width: size, height: size }}
      title={denom}
    >
      {monogram}
    </span>
  );
}
