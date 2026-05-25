'use client';

import { Card } from '@/components/ui/Card';
import type { ChainOverview } from '@/lib/chain/explorer';

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</span>
      <span className="font-mono text-lg font-semibold leading-none text-ink">{value}</span>
      {sub && <span className="text-[11px] text-faint">{sub}</span>}
    </div>
  );
}

export function NetworkStatus({ data }: { data: ChainOverview | null }) {
  const live = data && !data.catchingUp;
  return (
    <Card variant="hero" className="bg-hero-radial">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow">Network</span>
          <div className="mt-2 flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className={`absolute inline-flex h-full w-full rounded-full ${live ? 'animate-ping bg-yes/60' : 'bg-no/60'}`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? 'bg-yes' : 'bg-no'}`} />
            </span>
            <h2 className="font-display text-2xl font-bold leading-none tracking-marquee text-ink">
              {data?.chainId ?? '—'}
            </h2>
          </div>
          <p className="mt-1.5 text-xs text-ink-dim">
            {live ? 'Operational' : data?.catchingUp ? 'Catching up…' : 'Unreachable'}
            {data?.moniker ? ` · ${data.moniker}` : ''} · CometBFT / Cosmos SDK
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Block height</span>
          <div key={data?.height} className="animate-fade-in font-mono text-4xl font-bold leading-none text-gold-bright">
            {data ? data.height.toLocaleString() : '—'}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Stat label="Block time" value={data?.blockTimeSec != null ? `${data.blockTimeSec}s` : '—'} sub="avg, last 12" />
        <Stat label="Validators" value={data ? data.validators.length : '—'} sub="single-validator devnet" />
        <Stat label="App version" value={data?.appVersion ?? '—'} sub={data?.tmVersion ? `tm ${data.tmVersion}` : undefined} />
        <Stat label="Peers" value={data?.nPeers ?? '—'} sub={data?.catchingUp ? 'syncing' : 'synced'} />
      </div>
    </Card>
  );
}
