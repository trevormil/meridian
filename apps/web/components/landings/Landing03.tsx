'use client';

import Link from 'next/link';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto } from '@/lib/aggregator';
import { BrowseCta, PoweredBy, useCloseCountdown } from './Shared';
import { env } from '@/lib/env';
import { clsx } from 'clsx';

/**
 * Variant 3 — The clock.
 * Tension-anchored. Giant countdown to 4 PM ET dominates. Below: sparse
 * market grid. Subtle, time-pressure-driven.
 */
export function Landing03() {
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? [];
  const active = markets.filter((m) => m.status === 'active');
  const { label, phase } = useCloseCountdown();
  const totalVolume = markets.reduce((s, m) => s + Number(m.totalVolume ?? '0'), 0) / 10 ** env.usdcDecimals;

  return (
    <div className="space-y-16">
      <section className="flex min-h-[55vh] flex-col items-center justify-center text-center">
        <span className="eyebrow text-faint mb-6">Trading day in progress</span>
        <div
          className={clsx(
            'font-display font-medium leading-none tracking-marquee tabular-nums',
            'text-[clamp(4rem,16vw,12rem)]',
            phase === 'open'
              ? 'text-gold-bright'
              : phase === 'pre'
                ? 'text-ink'
                : 'text-muted',
          )}
        >
          {label}
        </div>
        <p className="mt-6 max-w-md text-sm text-ink-dim">
          {phase === 'open' ? (
            <>until <span className="text-gold">4:00 PM ET</span> close.{' '}
              <span className="text-ink">{active.length}</span> markets settle on oracle vote.{' '}
              <span className="font-mono text-faint">${totalVolume.toFixed(0)} volume traded</span>.
            </>
          ) : phase === 'pre' ? (
            <>Markets open at <span className="text-gold">9:30 AM ET</span>. Today's strikes were created at 8:00 AM by the morning script.</>
          ) : (
            <>Today's session has closed. Oracle has settled {active.length === 0 ? 'all' : ''} markets — winners can redeem.</>
          )}
        </p>
        <div className="mt-10 flex items-center gap-6">
          <BrowseCta label={phase === 'open' ? 'Trade now' : 'See today\'s markets'} />
          <PoweredBy />
        </div>
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between border-b border-border pb-3">
          <h2 className="font-display text-2xl font-semibold tracking-marquee text-ink">Markets settling today</h2>
          <Link href="/markets" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted hover:text-gold">
            See all →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.slice(0, 6).map((m) => (
            <MiniMarket key={m.collectionId} market={m} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniMarket({ market }: { market: MarketDto }) {
  const parsed = (market.name ?? '').match(/^([A-Z]{1,6})\s*>\s*\$([0-9,]+)/);
  return (
    <Link
      href={`/markets/${market.collectionId}`}
      className="group flex items-center justify-between gap-3 rounded border border-border bg-panel px-4 py-3 transition-colors hover:border-gold/40"
    >
      <div>
        {parsed ? (
          <>
            <span className="font-mono text-[10px] tracking-[0.14em] text-muted">{parsed[1]}</span>{' '}
            <span className="font-display text-lg font-semibold tracking-marquee text-ink group-hover:text-gold-bright">
              &gt; ${parsed[2]}
            </span>
          </>
        ) : (
          <span className="font-display text-base text-ink">{market.name}</span>
        )}
      </div>
      <span className="font-mono text-lg font-semibold text-yes">
        {(market.yesPrice * 100).toFixed(0)}%
      </span>
    </Link>
  );
}
