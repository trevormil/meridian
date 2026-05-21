'use client';

import { useEffect, useState } from 'react';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto, FillDto } from '@/lib/aggregator';
import { aggregator } from '@/lib/aggregator';
import { BrowseCta, PoweredBy } from './Shared';
import { env } from '@/lib/env';
import { clsx } from 'clsx';

/**
 * Variant 5 — Ledger split-screen.
 * 50/50: brand pitch left, live data column right (fills tape + top markets).
 */
export function Landing05() {
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? [];
  const top = [...markets]
    .filter((m) => m.status === 'active')
    .sort((a, b) => Number(b.totalVolume ?? '0') - Number(a.totalVolume ?? '0'))
    .slice(0, 6);

  return (
    <div className="grid min-h-[80vh] grid-cols-1 gap-0 lg:grid-cols-2">
      <section className="flex flex-col justify-center border-r border-border px-2 py-12 lg:px-10">
        <div className="relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-gold/30 bg-bg shadow-[0_0_32px_-8px_rgba(232,177,74,0.5)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/meridian-logo.png" alt="" width={48} height={48} className="h-full w-full object-cover" />
        </div>
        <h1 className="mt-8 font-display text-6xl font-semibold leading-[0.95] tracking-marquee text-ink">
          The trading day,
          <br />
          <span className="text-gold-bright">on-chain.</span>
        </h1>
        <p className="mt-8 max-w-md text-base leading-relaxed text-ink-dim">
          Daily binary markets on the seven largest US tech equities. Each
          contract pays <span className="font-mono text-gold">$1 USDC</span> for the
          winning side at <span className="font-mono">4:05 PM ET</span>. Non-custodial,
          oracle-settled, all on a single chain.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <BrowseCta label="Enter" />
          <a href="#how" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted hover:text-gold">
            How it works ↓
          </a>
        </div>
        <div className="mt-12">
          <PoweredBy tone="block" />
        </div>
      </section>

      <section className="flex flex-col gap-4 py-12 pl-2 lg:pl-10">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">Live fills</span>
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-yes">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-yes" />
              streaming
            </span>
          </div>
          <LiveFills markets={markets} />
        </div>

        <div>
          <span className="eyebrow mb-3 block">Top by volume</span>
          <div className="overflow-hidden rounded border border-border bg-panel">
            {top.map((m) => {
              const parsed = (m.name ?? '').match(/^([A-Z]{1,6})\s*>\s*\$([0-9,]+)/);
              const vol = (Number(m.totalVolume ?? '0') / 10 ** env.usdcDecimals).toFixed(2);
              return (
                <a
                  key={m.collectionId}
                  href={`/markets/${m.collectionId}`}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-panel-2"
                >
                  <span className="truncate font-display text-sm text-ink">
                    {parsed ? <>
                      <span className="font-mono text-[10px] text-muted">{parsed[1]}</span>{' '}
                      &gt; ${parsed[2]}
                    </> : m.name}
                  </span>
                  <span className="font-mono text-xs text-yes">{(m.yesPrice * 100).toFixed(0)}%</span>
                  <span className="font-mono text-[10px] text-faint">${vol}</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function LiveFills({ markets }: { markets: MarketDto[] }) {
  const [items, setItems] = useState<Array<FillDto & { marketName: string }>>([]);
  useEffect(() => {
    if (markets.length === 0) return;
    // Pull recent fills across the first 5 markets, merge + sort.
    Promise.all(
      markets.slice(0, 8).map(async (m) => {
        const fills = await aggregator.listFills(m.collectionId, 5).catch(() => []);
        return fills.map((f) => ({ ...f, marketName: m.name ?? `#${m.collectionId}` }));
      }),
    ).then((all) => {
      const merged = all.flat().sort((a, b) => b.ts - a.ts).slice(0, 10);
      setItems(merged);
    });
  }, [markets.length]);

  return (
    <ul className="space-y-1.5 overflow-hidden rounded border border-border bg-panel p-3">
      {items.length === 0 && <li className="py-4 text-center text-xs text-faint">awaiting fills…</li>}
      {items.map((f, i) => (
        <li key={i} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 font-mono text-[11px]">
          <span className="text-faint">
            {new Date(f.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
          <span className="truncate text-muted">{f.marketName.replace(/^\[[^\]]+]\s*/, '')}</span>
          <span className={clsx('uppercase tracking-[0.14em]', f.side === 'yes' ? 'text-yes' : 'text-no')}>
            {f.side}
          </span>
          <span className="text-ink">{(f.price * 100).toFixed(0)}¢</span>
        </li>
      ))}
    </ul>
  );
}
