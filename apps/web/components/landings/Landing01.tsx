'use client';

import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import { useEffect, useState } from 'react';
import type { MarketDto, FillDto } from '@/lib/aggregator';
import { aggregator } from '@/lib/aggregator';
import { BrowseCta, PoweredBy, useCloseCountdown } from './Shared';
import { env } from '@/lib/env';
import { clsx } from 'clsx';

/**
 * Variant 1 — Bloomberg terminal.
 * Maximalist live-data wall: scrolling top tape, ticker stack, fills column,
 * settle countdown. Cockpit feel.
 */
export function Landing01() {
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? [];
  const { label: countdown, phase } = useCloseCountdown();
  // Roll-up of MAG7 tickers' "hottest" strike (highest absolute % delta from
  // 50/50 prior) — gives the terminal a stack of "what's interesting now".
  const hottest = groupByTicker(markets);

  return (
    <div className="space-y-4">
      {/* Ticker tape header */}
      <div className="-mx-6 overflow-hidden border-y border-border bg-panel-2 py-2">
        <div className="ticker-track flex gap-10 whitespace-nowrap font-mono text-[11px]">
          {[...hottest, ...hottest].map((g, i) => (
            <span key={`${g.ticker}-${i}`} className="inline-flex items-center gap-2">
              <span className="text-muted">{g.ticker}</span>
              <span className="text-ink">${g.strike}</span>
              <span className={g.yesPct >= 50 ? 'text-yes' : 'text-no'}>
                {g.yesPct.toFixed(0)}%
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Ticker stack */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">Market stack</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                {markets.length} active
              </span>
            </div>
            <div className="overflow-hidden rounded border border-border bg-panel">
              {hottest.slice(0, 7).map((g) => (
                <a
                  key={g.ticker}
                  href={`/markets/${g.collectionId}`}
                  className="group grid grid-cols-[80px_1fr_80px_80px_140px] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 transition-colors hover:bg-panel-2"
                >
                  <span className="font-display text-base font-semibold text-ink">{g.ticker}</span>
                  <span className="font-mono text-xs text-muted">≥ ${g.strike}</span>
                  <span className={clsx('font-mono text-sm', g.yesPct >= 50 ? 'text-yes' : 'text-no')}>
                    {g.yesPct.toFixed(0)}%
                  </span>
                  <span className="font-mono text-[10px] text-faint">
                    {g.totalCount} strikes
                  </span>
                  <DepthMini yesPct={g.yesPct} />
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <BrowseCta label="Enter terminal" />
            <PoweredBy />
          </div>
        </div>

        <div className="space-y-4">
          {/* Settle countdown */}
          <div className="rounded border border-gold/40 bg-gold/5 px-5 py-4 text-center">
            <div className="eyebrow text-gold">Settle in</div>
            <div className={clsx('mt-2 font-mono text-3xl font-semibold tabular-nums', phase === 'open' ? 'text-gold-bright animate-pulse-soft' : 'text-muted')}>
              {countdown}
            </div>
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              4:00 PM ET close
            </div>
          </div>

          {/* Live fills tail — picks first collection that has fills */}
          {markets.length > 0 && <RecentFills collectionId={markets[0].collectionId} />}
        </div>
      </div>

      <style jsx>{`
        @keyframes ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        :global(.ticker-track) {
          animation: ticker 40s linear infinite;
        }
      `}</style>
    </div>
  );
}

function DepthMini({ yesPct }: { yesPct: number }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-sm border border-border bg-bg-deep">
      <div className="bg-yes" style={{ width: `${yesPct}%` }} />
      <div className="bg-no" style={{ width: `${100 - yesPct}%` }} />
    </div>
  );
}

function RecentFills({ collectionId }: { collectionId: string }) {
  const [fills, setFills] = useState<FillDto[]>([]);
  useEffect(() => {
    aggregator.listFills(collectionId, 20).then(setFills).catch(() => setFills([]));
  }, [collectionId]);
  return (
    <div className="rounded border border-border bg-panel">
      <div className="border-b border-border px-3 py-2 eyebrow">Live fills</div>
      <ul className="max-h-[280px] divide-y divide-border overflow-hidden">
        {fills.slice(0, 10).map((f, i) => (
          <li key={i} className="grid grid-cols-[auto_auto_1fr] items-center gap-2 px-3 py-1.5 text-[11px]">
            <span className="font-mono text-faint">
              {new Date(f.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <span className={clsx('font-mono text-[9px] uppercase tracking-[0.14em]', f.side === 'yes' ? 'text-yes' : 'text-no')}>
              {f.side}
            </span>
            <span className="text-right font-mono text-ink">{(f.price * 100).toFixed(0)}¢</span>
          </li>
        ))}
        {fills.length === 0 && <li className="px-3 py-4 text-center text-[10px] text-faint">waiting on first fill…</li>}
      </ul>
    </div>
  );
}

function groupByTicker(markets: MarketDto[]) {
  // Parse "TICKER > $STRIKE" out of names; pick the most-active (closest-to-50%)
  // strike per ticker so each row in the terminal is a single recognizable
  // ticker headline.
  const byTicker = new Map<string, { ticker: string; strike: string; yesPct: number; collectionId: string; totalCount: number }>();
  for (const m of markets) {
    const match = (m.name ?? '').match(/^([A-Z]{1,6})\s*[>≥]\s*\$([0-9,]+)/);
    if (!match) continue;
    const [, ticker, strike] = match;
    const yesPct = m.yesPrice * 100;
    const existing = byTicker.get(ticker);
    if (!existing || Math.abs(50 - yesPct) < Math.abs(50 - existing.yesPct)) {
      byTicker.set(ticker, {
        ticker,
        strike,
        yesPct,
        collectionId: m.collectionId,
        totalCount: (existing?.totalCount ?? 0) + 1,
      });
    } else {
      byTicker.set(ticker, { ...existing, totalCount: existing.totalCount + 1 });
    }
  }
  return [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}
