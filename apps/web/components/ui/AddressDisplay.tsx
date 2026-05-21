'use client';

import Blockies from 'react-blockies';
import { useState } from 'react';
import { shortAddr } from '@/lib/format';
import { clsx } from 'clsx';
import { ChainLogo } from './ChainLogo';

interface Props {
  /** bb1... cosmos address. Eth flag derived from a paired ethAddress prop. */
  address: string | null | undefined;
  /** 0x... — when set, shows MetaMask glyph + 0x form on hover. */
  ethAddress?: string | null;
  /** Show only the blockie, no text. Useful for tight contexts. */
  iconOnly?: boolean;
  /** Show the full address (no truncation). */
  full?: boolean;
  /** Pixel size of the blockie square. Default 16. */
  size?: number;
  className?: string;
  /** Click-to-copy. Defaults true. */
  copyable?: boolean;
}

/**
 * Compact address chip with deterministic Blockies identicon, optional EVM
 * tag, click-to-copy, and a tooltip with the full address. Mirrors the
 * bitbadges-frontend pattern but Tailwind-only (no antd).
 */
export function AddressDisplay({
  address,
  ethAddress,
  iconOnly = false,
  full = false,
  size = 16,
  className,
  copyable = true,
}: Props) {
  const [copied, setCopied] = useState(false);
  if (!address) return null;

  // When the wallet has an ETH address (MetaMask), show 0x form to the user —
  // chain accounting still uses `address` (bb1) under the hood. Hover/title
  // surfaces both so the user can verify or copy either.
  const userFacing = ethAddress ?? address;
  const display = full ? userFacing : shortAddr(userFacing);
  const title = ethAddress ? `${ethAddress}\n${address}` : address;
  const blockieSeed = (ethAddress ?? address).toLowerCase();
  const scale = Math.max(2, Math.round(size / 8));

  async function copy(e: React.MouseEvent) {
    if (!copyable) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      // Copy what the user SEES (ETH addr for MetaMask, bb1 otherwise) so
      // they can paste the same string they're looking at.
      await navigator.clipboard.writeText(userFacing!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // browser blocked clipboard — silently no-op
    }
  }

  const blockie = (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-sm align-middle leading-none"
      style={{ width: size, height: size, lineHeight: 0 }}
    >
      <Blockies seed={blockieSeed} size={8} scale={scale} className="block" />
    </span>
  );

  if (iconOnly) {
    return (
      <span
        onClick={copy}
        title={title}
        className={clsx('inline-flex items-center', copyable && 'cursor-pointer', className)}
      >
        {blockie}
      </span>
    );
  }

  // Chain glyph: EVM badge → ethereum logo, otherwise the BitBadges mark.
  // Lives just left of the address so it's visually grouped with the blockie.
  const chain = ethAddress ? 'ethereum' : 'bitbadges';

  return (
    <span
      onClick={copy}
      title={title}
      className={clsx(
        'inline-flex items-center gap-1.5 align-middle',
        copyable && 'cursor-pointer hover:text-ink',
        className,
      )}
    >
      <ChainLogo chain={chain} size={Math.max(12, size - 2)} />
      {blockie}
      <span className="font-mono text-[11px] leading-none">{display}</span>
      {copyable && (
        <span className={clsx('text-[10px] leading-none', copied ? 'text-yes' : 'text-muted')}>
          {copied ? '✓' : '·'}
        </span>
      )}
    </span>
  );
}
