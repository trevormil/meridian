'use client';

import { usePolling } from '@/lib/usePolling';
import { getChainOverview } from '@/lib/chain/explorer';
import { NetworkStatus } from '@/components/explorer/NetworkStatus';
import { ValidatorCard } from '@/components/explorer/ValidatorCard';
import { RecentBlocks } from '@/components/explorer/RecentBlocks';
import { NodeLogs } from '@/components/explorer/NodeLogs';

export default function ExplorerPage() {
  const { data } = usePolling(getChainOverview, 1500);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <span className="eyebrow">Network</span>
        <h1 className="text-gold-gradient mt-2 font-display text-4xl font-bold leading-[1.05] tracking-marquee sm:text-5xl">
          Chain Explorer
        </h1>
        <p className="mt-3 max-w-xl text-sm text-ink-dim">
          The BitBadges devnet Meridian runs on — live block production, consensus, and node logs.
          Every market is a real on-chain collection settled by a verifier vote.
        </p>
      </div>

      <NetworkStatus data={data} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentBlocks blocks={data?.blocks ?? null} />
        </div>
        <ValidatorCard data={data} />
      </div>

      <NodeLogs />
    </div>
  );
}
