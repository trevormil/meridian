'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { aggregator, type MarketDto } from '@/lib/aggregator';
import { useWallet } from '@/contexts/WalletContext';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import { resolveApprovals, type SettlementApprovals } from '@/lib/prediction-market/sdk';
import { Tabs } from '@/components/ui/Tabs';
import { MarketOverviewTab } from '@/components/prediction/MarketOverviewTab';
import { MarketHeader } from '@/components/prediction/MarketHeader';
import { DepositPanel } from '@/components/prediction/DepositPanel';
import { RedeemPanel } from '@/components/prediction/RedeemPanel';
import { SettlePanel } from '@/components/prediction/SettlePanel';
import { ActivityFeed } from '@/components/prediction/ActivityFeed';
import { YourPositionBar } from '@/components/prediction/YourPositionBar';
import { Skeleton } from '@/components/ui/Empty';

type TabKey = 'market' | 'activity' | 'deposit' | 'redeem' | 'settle';

export default function MarketPage() {
  const params = useParams<{ collectionId: string }>();
  const id = params.collectionId;
  const { address } = useWallet();

  // Realtime market data — server pushes on price/status/volume changes.
  const market = useRealtime<MarketDto>(ch.market(id));

  // Approvals come from the raw collection JSON, which only changes when the
  // collection is re-fetched by bootstrap. Fetch once per collection via REST.
  const [approvals, setApprovals] = useState<SettlementApprovals>({});
  useEffect(() => {
    aggregator
      .getMarketRaw(id)
      .then((r) => {
        if (r.collection) setApprovals(resolveApprovals(r.collection));
      })
      .catch(() => {});
  }, [id]);

  const [tab, setTab] = useState<TabKey>('market');

  const isVerifier = useMemo(
    () => !!address && !!market?.verifierAddress && address === market.verifierAddress,
    [address, market?.verifierAddress],
  );

  const tabs = useMemo(
    () => [
      // "Market" is now the merged trading view: chart + order book + place-order
      // form (was previously split across Market + Order Book tabs).
      { key: 'market', label: 'Trade' },
      { key: 'activity', label: 'Activity' },
      { key: 'deposit', label: 'Deposit' },
      { key: 'redeem', label: 'Redeem' },
      { key: 'settle', label: 'Settlement', hidden: !isVerifier },
    ],
    [isVerifier],
  );

  if (!market) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <MarketHeader market={market} />
      <YourPositionBar market={market} />
      <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />
      <div>
        {tab === 'market' && <MarketOverviewTab market={market} />}
        {tab === 'activity' && <ActivityFeed market={market} />}
        {tab === 'deposit' && (
          <div className="mx-auto max-w-lg">
            <DepositPanel collectionId={market.collectionId} mintApprovalId={approvals.mintApprovalId} market={market} />
          </div>
        )}
        {tab === 'redeem' && (
          <div className="mx-auto max-w-lg">
            <RedeemPanel market={market} approvals={approvals} />
          </div>
        )}
        {tab === 'settle' && (
          <div className="mx-auto max-w-lg">
            <SettlePanel market={market} approvals={approvals} />
          </div>
        )}
      </div>
    </div>
  );
}
