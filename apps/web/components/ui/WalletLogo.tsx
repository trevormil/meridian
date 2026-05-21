'use client';

import Image from 'next/image';
import { clsx } from 'clsx';

type Kind = 'keplr' | 'metamask' | 'test' | null;

const SRC: Record<Exclude<Kind, null>, string> = {
  keplr: '/wallets/keplr.svg',
  metamask: '/wallets/metamask.png',
  // Test mode shows a generic terminal/debug glyph — no copyrighted logo.
  test: '',
};

const ALT: Record<Exclude<Kind, null>, string> = {
  keplr: 'Keplr wallet',
  metamask: 'MetaMask wallet',
  test: 'Test persona',
};

interface Props {
  kind: Kind;
  size?: number;
  className?: string;
}

export function WalletLogo({ kind, size = 16, className }: Props) {
  if (!kind) return null;
  if (kind === 'test') {
    return (
      <span
        title="Test persona (mnemonic signer)"
        className={clsx(
          'inline-flex items-center justify-center rounded-sm border border-border bg-panel-2 font-mono text-[10px] leading-none',
          className,
        )}
        style={{ width: size, height: size }}
      >
        ⌥
      </span>
    );
  }
  return (
    <Image
      src={SRC[kind]}
      alt={ALT[kind]}
      title={ALT[kind]}
      width={size}
      height={size}
      className={clsx('inline-block', className)}
      unoptimized
    />
  );
}
