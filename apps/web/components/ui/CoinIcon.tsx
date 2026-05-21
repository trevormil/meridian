import { clsx } from 'clsx';
import { coinInfo, type CoinInfo } from '@/lib/coins';

interface Props {
  denom: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
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
 * Round coin avatar. Renders the registered logo if available, otherwise a
 * colored text initial. We use plain <img> (not next/image) to avoid the
 * cross-origin loader headache for cosmos chain-registry hosted PNGs.
 */
export function CoinIcon({ denom, size = 'md', className }: Props) {
  const info = coinInfo(denom);
  if (info.image) {
    return (
      <img
        src={info.image}
        alt={info.symbol}
        className={clsx(sizeMap[size], 'rounded-full border border-border bg-bg object-contain', className)}
        onError={(e) => {
          // Hide broken image; the parent layout will keep the symbol next to it.
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return (
    <span
      className={clsx(
        sizeMap[size],
        'flex items-center justify-center rounded-full border font-bold uppercase tracking-tighter',
        accentMap[info.accent],
        className,
      )}
    >
      {info.symbol.slice(0, info.symbol.length > 3 ? 2 : info.symbol.length)}
    </span>
  );
}
