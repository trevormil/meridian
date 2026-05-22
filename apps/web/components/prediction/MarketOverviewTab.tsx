'use client';

import type { MarketDto } from '@/lib/aggregator';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { PriceChart } from './PriceChart';
import { PlaceOrderCard, OrderBookCard } from './IntentsPanel';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { env } from '@/lib/env';

interface Props {
  market: MarketDto;
}

/**
 * Merged trading view (was two tabs: Market + Order Book).
 *
 * Two independent column stacks so the order book hugs the chart with no
 * row-height coupling (a 3-col unified grid stretched row 1 to the taller
 * place-order form, leaving a gap under the chart):
 *   left  (2/3): chart → order book   (stacked, small gap)
 *   right (1/3): place order → market info
 * On mobile both columns collapse: chart → order book → place order → info.
 */
export function MarketOverviewTab({ market }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left column — chart then order book directly beneath it */}
      <div className="flex flex-col gap-4 lg:col-span-2">
        <PriceChart collectionId={market.collectionId} />
        <OrderBookCard market={market} />
      </div>

      {/* Right column — place order on top, market info beneath */}
      <div className="flex flex-col gap-4 lg:col-span-1">
        <PlaceOrderCard market={market} />
        <Card>
          <CardHeader>
            <CardTitle>Market info</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Row
              label="Total volume"
              value={
                <CoinDisplay denom={market.depositDenom ?? env.usdcDenom} amount={market.totalVolume} size="sm" />
              }
            />
            <Row
              label="Backing coin"
              value={
                <span className="flex items-center gap-1.5">
                  <CoinIcon denom={market.depositDenom ?? env.usdcDenom} size="xs" /> {env.usdcSymbol}
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
