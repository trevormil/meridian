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
 * Layout via a 3-col grid with DOM order [chart, place-order, book, info]
 * and col-spans 2/1/2/1. Grid auto-placement lands them as:
 *   ┌─────────────── chart ──────────────┐ ┌─ place order ─┐
 *   └──────────────── book ──────────────┘ └──── info ─────┘
 * The same DOM order collapses to a sensible single-column mobile stack:
 *   chart → place order → order book → info (trade action stays near the top).
 */
export function MarketOverviewTab({ market }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* row 1, left (span 2) */}
      <div className="lg:col-span-2">
        <PriceChart collectionId={market.collectionId} />
      </div>

      {/* row 1, right — place order sits at the top of the right column */}
      <div className="lg:col-span-1">
        <PlaceOrderCard market={market} />
      </div>

      {/* row 2, left (span 2) — order book beneath the chart */}
      <div className="lg:col-span-2">
        <OrderBookCard market={market} />
      </div>

      {/* row 2, right — market info beneath the order form */}
      <div className="lg:col-span-1">
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
