'use client';

import Link from 'next/link';
import { aggregator, type MarketDto } from '@/lib/aggregator';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import { MarketCard } from '@/components/prediction/MarketCard';
import { Button } from '@/components/ui/Button';
import { Empty, Skeleton } from '@/components/ui/Empty';
import { useState } from 'react';

export default function HomePage() {
  // Live-streamed market list. The aggregator pushes the full array whenever
  // any market is added or its price/status/volume changes.
  const markets = useRealtime<MarketDto[]>(ch.markets);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await aggregator.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Markets</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Daily binary outcome contracts on MAG7 stock closing prices. Each contract pays
              $1 USDC for the winning side, $0 for the losing side. Auto-settled via oracle at
              4:05 PM ET. USDC-backed, fully on-chain.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={manualRefresh} loading={refreshing}>
              Refresh
            </Button>
            <Link href="/create">
              <Button>+ New market</Button>
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-no/40 bg-no/10 p-4 text-sm text-no">
          {error}
        </div>
      )}

      {markets === null && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      )}

      {markets?.length === 0 && (
        <Empty
          title="No markets yet"
          description="Create the first prediction market — anyone can be a verifier."
          action={
            <Link href="/create">
              <Button>Create the first market</Button>
            </Link>
          }
        />
      )}

      {markets && markets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {markets.map((m) => (
            <MarketCard key={m.collectionId} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}
