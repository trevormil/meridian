'use client';

import Link from 'next/link';
import { usePolling } from '@/lib/usePolling';
import { getChainTip } from '@/lib/chain/explorer';

/**
 * Always-on chain-health chip in the header. Pulses on each new block and
 * links to /explorer. Polls the lightweight /chain/tip (single cached RPC
 * call) so it's cheap to run site-wide.
 */
export function ChainPulse() {
  const { data } = usePolling(getChainTip, 4000);
  const live = !!data && !data.catchingUp;
  const dot = live ? 'bg-yes' : data?.catchingUp ? 'bg-amber' : 'bg-no';

  return (
    <Link
      href="/explorer"
      title={data?.chainId ? `${data.chainId} · ${live ? 'live' : data.catchingUp ? 'syncing' : 'unreachable'} · view explorer` : 'Chain explorer'}
      className="hidden shrink-0 items-center gap-2 rounded-full border border-border bg-panel/40 px-3 py-1 transition-colors hover:border-gold/40 hover:bg-gold/5 md:inline-flex"
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yes/60" />}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dot}`} />
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/chains/bitbadges.png" alt="" width={12} height={12} className="h-3 w-3 rounded-full opacity-80" />
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-faint">
        {data ? `${data.height.toLocaleString()} blk` : 'BitBadges'}
      </span>
    </Link>
  );
}
