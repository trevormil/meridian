'use client';

import { useEffect, useMemo, useState } from 'react';
import { aggregator, type FillDto, type MarketDto } from '@/lib/aggregator';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { UsdcSymbol } from '@/components/ui/UsdcSymbol';
import { useWallet } from '@/contexts/WalletContext';
import { env } from '@/lib/env';
import { clsx } from 'clsx';

/**
 * Activity feed — every filled order on a market, most-recent first. Subscribes
 * to the realtime `fills:{id}` channel so new trades append within a block of
 * landing. Two views: "All trades" and "Mine" (counterparty filter).
 */
interface Props {
  market: MarketDto;
}

type View = 'all' | 'mine';

export function ActivityFeed({ market }: Props) {
  const { address } = useWallet();
  const [view, setView] = useState<View>('all');
  // Realtime push every time a fill lands on this market.
  const live = useRealtime<FillDto[]>(ch.fills(market.collectionId));
  // Fallback to REST until the WS snapshot arrives.
  const [rest, setRest] = useState<FillDto[] | null>(null);
  useEffect(() => {
    aggregator.listFills(market.collectionId, 200).then(setRest).catch(() => setRest([]));
  }, [market.collectionId]);

  const fills = live ?? rest ?? [];
  const filtered = useMemo(() => {
    if (view === 'all') return fills;
    if (!address) return [];
    return fills.filter((f) => f.fromAddress === address || f.toAddress === address);
  }, [view, fills, address]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1">
          <SubTabBtn label={`All (${fills.length})`} active={view === 'all'} onClick={() => setView('all')} />
          {address && (
            <SubTabBtn
              label={`Mine (${fills.filter((f) => f.fromAddress === address || f.toAddress === address).length})`}
              active={view === 'mine'}
              onClick={() => setView('mine')}
            />
          )}
        </div>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-yes">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-yes" />
          live
        </span>
      </CardHeader>

      {filtered.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm text-faint">
            {view === 'mine'
              ? "You haven't traded on this market yet."
              : 'No trades on this market yet.'}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <ul className="divide-y divide-border">
          <li className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 py-2 text-[10px] uppercase tracking-[0.14em] text-muted sm:gap-3">
            <span>Time</span>
            <span>Side</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Total</span>
          </li>
          {filtered.slice(0, 100).map((f, i) => (
            <FillRow key={`${f.approvalId}-${i}`} fill={f} self={address ?? undefined} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SubTabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded px-3 py-1 text-sm font-medium transition-colors',
        active ? 'bg-border text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}

function FillRow({ fill, self }: { fill: FillDto; self?: string }) {
  const sideCls =
    fill.side === 'yes'
      ? 'border-yes/40 bg-yes/10 text-yes-bright'
      : 'border-no/40 bg-no/10 text-no-bright';
  const tokenBase = BigInt(fill.tokenAmount);
  const coinBase = BigInt(fill.coinAmount);
  // Multi-leg cross-fills: coinAmount is summed across legs. Divide by leg
  // count (matched to the price's averaging) so the row total reads sanely.
  // For single-leg fills (1 leg) this is a no-op.
  const tokens = formatBase(tokenBase, env.usdcDecimals);
  const total = formatBase(coinBase, env.usdcDecimals);
  const pricePct = (fill.price * 100).toFixed(0);

  const time = new Date(fill.ts);
  const isToday = isSameDay(time, new Date());
  const timeLabel = isToday
    ? time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const isMine = self && (fill.fromAddress === self || fill.toAddress === self);

  return (
    <li
      className={clsx(
        'grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 py-2.5 transition-colors sm:gap-3',
        isMine && 'bg-gold/[0.03]',
      )}
    >
      <span className="font-mono text-[11px] text-muted">{timeLabel}</span>

      <div className="flex min-w-0 items-center gap-2">
        <span
          className={clsx(
            'inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]',
            sideCls,
          )}
        >
          {fill.side.toUpperCase()}
        </span>
        {/* from→to addresses are detail — hide on mobile to keep the row from
            overflowing; the numeric columns are what matter on a phone. */}
        <span className="hidden min-w-0 items-center gap-1.5 text-[11px] text-muted sm:inline-flex">
          <AddressDisplay address={fill.fromAddress} size={11} copyable={false} />
          <span className="text-faint">→</span>
          <AddressDisplay address={fill.toAddress} size={11} copyable={false} />
        </span>
      </div>

      <span className="text-right font-mono text-sm text-ink">{tokens}</span>

      <span className="text-right font-mono text-sm text-ink">
        {pricePct}<span className="text-muted">¢</span>
      </span>

      <span className="text-right">
        <span className="inline-flex items-center gap-1 font-mono text-sm text-ink">
          {total}
          <UsdcSymbol size="xs" className="text-muted" />
        </span>
      </span>
    </li>
  );
}

function formatBase(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0';
  const div = BigInt(10) ** BigInt(decimals);
  const whole = raw / div;
  const frac = raw % div;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 2);
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
