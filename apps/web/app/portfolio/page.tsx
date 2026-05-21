'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/contexts/WalletContext';
import { getBankBalances, getUserBalance, type Coin } from '@/lib/chain/lcd';
import { aggregator, type IntentDto, type MarketDto } from '@/lib/aggregator';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { Empty, Skeleton } from '@/components/ui/Empty';
import { Button } from '@/components/ui/Button';
import { sumYesNo } from '@/lib/prediction-market/balances';
import { env } from '@/lib/env';
import { FaucetCard } from '@/components/wallet/FaucetCard';

interface Position {
  market: MarketDto;
  yes: bigint;
  no: bigint;
}

export default function PortfolioPage() {
  const { address, connect } = useWallet();
  const [positions, setPositions] = useState<Position[]>([]);
  const [usdc, setUsdc] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // Realtime: any change to ANY of this user's intents on any market is pushed
  // to us. Positions + bank balance are still chain-side and refetched on tick.
  const intents = useRealtime<IntentDto[]>(address ? ch.intentsOwner(address) : null) ?? [];

  // Realtime: any market metadata change re-fires this and we recompute positions.
  // Cheap because the heavy work is the per-collection UserBalance lookup; that's
  // gated by the same tick.
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? null;

  useEffect(() => {
    if (!address || markets === null) return;
    let cancel = false;
    setLoading(true);
    (async () => {
      // YES/NO live in tokenization (x/tokenization UserBalanceStore), NOT
      // cosmos-bank — so we have to query each known market's balance store
      // individually. Bank is only used for the USDC backing denom.
      const bank = await getBankBalances(address);
      if (cancel) return;
      const stores = await Promise.all(
        markets.map(async (m) => ({ market: m, store: await getUserBalance(m.collectionId, address) })),
      );
      if (cancel) return;
      const pos: Position[] = [];
      for (const { market, store } of stores) {
        const { yes, no } = sumYesNo(store);
        if (yes > 0n || no > 0n) pos.push({ market, yes, no });
      }
      setPositions(pos);
      const u = bank.find((b: Coin) => b.denom === env.usdcDenom);
      setUsdc(BigInt(u?.amount ?? '0'));
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => {
      cancel = true;
    };
  }, [address, markets, refreshTick]);

  if (!address) {
    return (
      <Empty
        title="Connect a wallet"
        description="View your prediction-market positions and open orders."
        action={<Button onClick={connect}>Connect Keplr</Button>}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Portfolio</h1>
        <p className="mt-1 text-sm text-muted">Your YES/NO positions and open orders across all markets.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card variant="hero" className="bg-hero-radial">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Available {env.usdcSymbol}</div>
              <div className="mt-1 flex items-center gap-3">
                <CoinIcon denom={env.usdcDenom} size="lg" />
                <CoinDisplay denom={env.usdcDenom} amount={usdc} icon={false} size="lg" mono />
              </div>
            </div>
            <Link href="/">
              <Button variant="secondary">Browse markets</Button>
            </Link>
          </div>
        </Card>
        <FaucetCard />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Positions ({positions.length})</CardTitle>
        </CardHeader>
        {loading && <div className="space-y-2"><Skeleton className="h-16 w-full rounded-lg" /><Skeleton className="h-16 w-full rounded-lg" /></div>}
        {!loading && positions.length === 0 && <p className="text-sm text-muted">No positions yet. Deposit on any market to mint YES + NO tokens.</p>}
        {positions.length > 0 && (
          <ul className="space-y-2">
            {positions.map((p) => (
              <li key={p.market.collectionId}>
                <Link
                  href={`/markets/${p.market.collectionId}`}
                  className="block rounded-lg border border-border bg-bg/40 p-3 transition-colors hover:border-border-hi hover:bg-panel-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{p.market.name ?? `Market #${p.market.collectionId}`}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">#{p.market.collectionId}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm">
                      <CoinDisplay denom={`badgeslp:${p.market.collectionId}:uyes`} amount={p.yes} size="sm" mono />
                      <CoinDisplay denom={`badgeslp:${p.market.collectionId}:uno`} amount={p.no} size="sm" mono />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open orders ({intents.filter((i) => i.isActive).length})</CardTitle>
        </CardHeader>
        {intents.length === 0 && <p className="text-sm text-muted">You haven't placed any orders.</p>}
        {intents.length > 0 && (
          <ul className="space-y-2">
            {intents.map((i) => (
              <li key={`${i.collectionId}:${i.approvalLevel}:${i.approvalId}`}>
                <Link
                  href={`/markets/${i.collectionId}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg/40 px-3 py-2 text-sm transition-colors hover:border-border-hi"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={
                        i.approvalLevel === 'incoming'
                          ? 'rounded border border-yes/40 bg-yes/10 px-1.5 py-0.5 text-[10px] font-semibold text-yes'
                          : 'rounded border border-no/40 bg-no/10 px-1.5 py-0.5 text-[10px] font-semibold text-no'
                      }
                    >
                      {i.approvalLevel === 'incoming' ? 'BUY' : 'SELL'}
                    </span>
                    <span className="font-mono">{i.payAmount}</span>
                    <span className="text-muted">{i.payDenom?.slice(0, 16)}…</span>
                  </span>
                  <span className={`text-xs ${i.used ? 'text-muted' : i.isExpired ? 'text-no' : 'text-yes'}`}>
                    {i.used ? 'Filled' : i.isExpired ? 'Expired' : i.isPending ? 'Pending' : 'Active'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
