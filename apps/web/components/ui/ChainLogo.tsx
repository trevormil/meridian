'use client';

import Image from 'next/image';
import { clsx } from 'clsx';

type Chain = 'bitbadges' | 'ethereum';

const SRC: Record<Chain, string> = {
  bitbadges: '/chains/bitbadges.png',
  ethereum: '/chains/ethereum.png',
};

const ALT: Record<Chain, string> = {
  bitbadges: 'BitBadges chain',
  ethereum: 'EVM (Ethermint) signing',
};

export function ChainLogo({ chain, size = 12, className }: { chain: Chain; size?: number; className?: string }) {
  return (
    <Image
      src={SRC[chain]}
      alt={ALT[chain]}
      title={ALT[chain]}
      width={size}
      height={size}
      className={clsx('inline-block rounded-sm', className)}
      unoptimized
    />
  );
}
