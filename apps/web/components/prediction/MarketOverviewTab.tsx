'use client';

import type { MarketDto } from '@/lib/aggregator';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { ProbabilityBar } from './ProbabilityBar';
import { PriceChart } from './PriceChart';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { pct } from '@/lib/format';
import { env } from '@/lib/env';

interface Props {
  market: MarketDto;
}

export function MarketOverviewTab({ market }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card variant="hero">
          <CardHeader>
            <CardTitle>Current odds</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 gap-3">
            <OutcomeCard side="yes" price={market.yesPrice} />
            <OutcomeCard side="no" price={market.noPrice} />
          </div>
          <div className="mt-4">
            <ProbabilityBar yesPrice={market.yesPrice} noPrice={market.noPrice} size="md" showLabels={false} />
          </div>
        </Card>
        <PriceChart collectionId={market.collectionId} />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Market info</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Row label="Total volume" value={<CoinDisplay denom={market.depositDenom ?? env.usdcDenom} amount={market.totalDeposited} size="sm" />} />
            <Row label="Backing coin" value={<span className="flex items-center gap-1.5"><CoinIcon denom={market.depositDenom ?? env.usdcDenom} size="xs" /> {env.usdcSymbol}</span>} />
            <Row label="Verifier" value={<AddressDisplay address={market.verifierAddress} size={14} className="text-ink" />} />
            <Row label="Collection" value={<span className="font-mono text-xs">#{market.collectionId}</span>} />
            <Row label="Status" value={<span className="capitalize">{market.status.replace(/-/g, ' ')}</span>} />
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function OutcomeCard({ side, price }: { side: 'yes' | 'no'; price: number }) {
  const isYes = side === 'yes';
  return (
    <div
      className={
        isYes
          ? 'rounded-lg border border-yes/30 bg-yes-gradient p-4'
          : 'rounded-lg border border-no/30 bg-no-gradient p-4'
      }
    >
      <div className={isYes ? 'text-[10px] font-semibold uppercase tracking-wider text-yes' : 'text-[10px] font-semibold uppercase tracking-wider text-no'}>
        {side.toUpperCase()}
      </div>
      <div className={isYes ? 'mt-1 font-mono text-3xl font-bold text-yes' : 'mt-1 font-mono text-3xl font-bold text-no'}>
        {pct(price)}
      </div>
    </div>
  );
}
