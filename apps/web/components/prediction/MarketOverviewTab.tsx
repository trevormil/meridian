'use client';

import type { MarketDto } from '@/lib/aggregator';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { PriceChart } from './PriceChart';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { env } from '@/lib/env';

interface Props {
  market: MarketDto;
}

export function MarketOverviewTab({ market }: Props) {
  // The MarketHeader already shows the YES/NO probability + the probability
  // bar above this tab, so we skip the redundant "Current odds" card and
  // make the price chart the primary focus here.
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <PriceChart collectionId={market.collectionId} />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Market info</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Row
              label="Total volume"
              value={
                <CoinDisplay
                  denom={market.depositDenom ?? env.usdcDenom}
                  amount={market.totalVolume}
                  size="sm"
                />
              }
            />
            <Row
              label="Backing coin"
              value={
                <span className="flex items-center gap-1.5">
                  <CoinIcon denom={market.depositDenom ?? env.usdcDenom} size="xs" />{' '}
                  {env.usdcSymbol}
                </span>
              }
            />
            <Row
              label="Verifier"
              value={<AddressDisplay address={market.verifierAddress} size={14} className="text-ink" />}
            />
            <Row label="Collection" value={<span className="font-mono text-xs">#{market.collectionId}</span>} />
            <Row
              label="Status"
              value={<span className="capitalize">{market.status.replace(/-/g, ' ')}</span>}
            />
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
