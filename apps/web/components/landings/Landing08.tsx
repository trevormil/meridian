'use client';

import Link from 'next/link';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto } from '@/lib/aggregator';
import { BrowseCta, PoweredBy } from './Shared';
import { env } from '@/lib/env';
import { clsx } from 'clsx';

/**
 * Variant 8 — Today's biggest movers.
 * Activity-first. Three large mover cards front-and-center, each with a
 * mini ProbabilityBar. Standard grid below.
 */
export function Landing08() {
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? [];
  const active = markets.filter((m) => m.status === 'active');
  // "Movers" = farthest from 50/50 (highest conviction).
  const movers = [...active]
    .sort((a, b) => Math.abs(b.yesPrice - 0.5) - Math.abs(a.yesPrice - 0.5))
    .slice(0, 3);
  const totalVol = active.reduce((s, m) => s + Number(m.totalVolume ?? '0'), 0) / 10 ** env.usdcDecimals;

  return (
    <div className="space-y-14">
      <section className="text-center">
        <span className="eyebrow text-gold">Today's session</span>
        <h1 className="mt-3 font-display text-6xl font-semibold leading-none tracking-marquee text-ink md:text-7xl">
          What's moving
        </h1>
        <p className="mt-6 max-w-xl mx-auto text-sm text-ink-dim">
          <span className="font-mono text-ink">{active.length}</span> MAG7 markets live ·{' '}
          <span className="font-mono text-gold">${totalVol.toFixed(0)} USDC</span> volume ·
          ranked by conviction
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {movers.map((m, i) => (
          <BigMover key={m.collectionId} market={m} rank={i + 1} />
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between border-b border-border pb-2">
          <span className="eyebrow">All markets · {active.length}</span>
          <BrowseCta variant="arrow" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {active.slice(0, 9).map((m) => {
            const parsed = (m.name ?? '').match(/^([A-Z]{1,6})\s*>\s*\$([0-9,]+)/);
            return (
              <Link
                key={m.collectionId}
                href={`/markets/${m.collectionId}`}
                className="group flex items-center justify-between gap-3 rounded border border-border bg-panel px-3 py-2.5 transition-colors hover:border-gold/40"
              >
                <span className="truncate font-display text-sm">
                  {parsed ? (
                    <>
                      <span className="font-mono text-[10px] text-muted">{parsed[1]}</span>{' '}
                      <span className="text-ink group-hover:text-gold-bright">&gt;${parsed[2]}</span>
                    </>
                  ) : m.name}
                </span>
                <span className={clsx('font-mono text-sm', m.yesPrice >= 0.5 ? 'text-yes' : 'text-no')}>
                  {(m.yesPrice * 100).toFixed(0)}%
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="border-t border-border pt-8 text-center">
        <PoweredBy />
      </div>
    </div>
  );
}

function BigMover({ market, rank }: { market: MarketDto; rank: number }) {
  const parsed = (market.name ?? '').match(/^([A-Z]{1,6})\s*>\s*\$([0-9,]+)/);
  const pct = market.yesPrice * 100;
  const lean = pct >= 50 ? 'yes' : 'no';
  const conviction = Math.abs(50 - pct);
  const accentBorder = lean === 'yes' ? 'border-l-yes' : 'border-l-no';

  return (
    <Link
      href={`/markets/${market.collectionId}`}
      className={clsx(
        'group block rounded border border-l-2 border-border bg-panel p-6 transition-all hover:-translate-y-0.5 hover:shadow-lift',
        accentBorder,
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted">RANK {rank}</span>
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
          {conviction.toFixed(0)}% lean
        </span>
      </div>
      {parsed && (
        <div className="mt-3 font-mono text-[10px] tracking-[0.18em] text-muted">{parsed[1]}</div>
      )}
      <h3 className="mt-1 font-display text-3xl font-semibold leading-none tracking-marquee text-ink group-hover:text-gold-bright">
        {parsed ? `> $${parsed[2]}` : market.name}
      </h3>

      <div className="mt-6 space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className={clsx('font-mono uppercase tracking-[0.14em]', lean === 'yes' ? 'text-yes' : 'text-no')}>
            {lean.toUpperCase()} leads
          </span>
          <span className={clsx('font-mono text-2xl font-semibold', lean === 'yes' ? 'text-yes-bright' : 'text-no-bright')}>
            {(pct >= 50 ? pct : 100 - pct).toFixed(0)}%
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-sm border border-border bg-bg-deep">
          <div className="bg-yes" style={{ width: `${pct}%` }} />
          <div className="bg-no" style={{ width: `${100 - pct}%` }} />
        </div>
      </div>
    </Link>
  );
}
