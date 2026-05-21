'use client';

import Link from 'next/link';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto } from '@/lib/aggregator';
import { BrowseCta, PoweredBy } from './Shared';

/**
 * Variant 4 — Editorial / NYT-style.
 * Magazine layout. MERIDIAN masthead in Fraunces, dateline rule, editorial
 * intro paragraph, 3 hero "biggest movers" cards, full grid below.
 */
export function Landing04() {
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? [];
  const active = markets.filter((m) => m.status === 'active');
  // "Movers" = farthest from 50/50 (high conviction either way).
  const movers = [...active].sort((a, b) => Math.abs(b.yesPrice - 0.5) - Math.abs(a.yesPrice - 0.5)).slice(0, 3);
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });

  return (
    <article className="space-y-12">
      <header className="border-b-2 border-ink/20 pb-8 pt-4">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          <span>{today}</span>
          <span>Vol. I · No. 1</span>
        </div>
        <h1 className="mt-4 text-center font-display text-[clamp(4rem,12vw,9rem)] font-semibold leading-none tracking-marquee text-ink">
          MERIDIAN
        </h1>
        <p className="mt-4 text-center text-xs uppercase tracking-[0.32em] text-faint">
          Binary stock outcome markets · settled by oracle
        </p>
      </header>

      <section className="mx-auto max-w-3xl">
        <p className="font-display text-xl leading-relaxed text-ink first-letter:float-left first-letter:mr-3 first-letter:font-semibold first-letter:text-7xl first-letter:leading-[0.85] first-letter:text-gold-bright">
          On any given trading day, the seven largest US tech equities open
          a chorus of binary questions: will each one close above each strike?
          Meridian renders those questions as on-chain markets — YES and NO
          tokens you can trade right up to <span className="font-mono text-gold">4:00 PM ET</span>.
          Each pays <span className="font-mono text-ink">$1 USDC</span> for the winning side,
          $0 for the loser. The oracle settles at 4:05.
        </p>
        <div className="mt-8 flex items-center gap-6">
          <BrowseCta label="Read the markets" variant="arrow" />
          <PoweredBy />
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between border-b border-border pb-2">
          <h2 className="eyebrow text-ink">Today's biggest movers</h2>
          <span className="font-mono text-[10px] text-faint">conviction-weighted</span>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {movers.map((m) => (
            <MoverCard key={m.collectionId} market={m} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-3 border-b border-border pb-2">All markets · {active.length}</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3 lg:grid-cols-4">
          {active.map((m) => {
            const parsed = (m.name ?? '').match(/^([A-Z]{1,6})\s*>\s*\$([0-9,]+)/);
            return (
              <Link
                key={m.collectionId}
                href={`/markets/${m.collectionId}`}
                className="group flex items-baseline justify-between border-b border-border/60 py-1.5 transition-colors hover:border-gold/40"
              >
                <span className="font-display text-sm text-ink-dim transition-colors group-hover:text-gold-bright">
                  {parsed ? (
                    <>
                      <span className="font-mono text-[9px] tracking-[0.12em] text-muted">{parsed[1]}</span>{' '}
                      &gt; ${parsed[2]}
                    </>
                  ) : (
                    m.name
                  )}
                </span>
                <span className="font-mono text-xs text-yes">
                  {(m.yesPrice * 100).toFixed(0)}%
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </article>
  );
}

function MoverCard({ market }: { market: MarketDto }) {
  const parsed = (market.name ?? '').match(/^([A-Z]{1,6})\s*>\s*\$([0-9,]+)/);
  const pct = market.yesPrice * 100;
  const lean = pct >= 50 ? 'YES' : 'NO';
  const tone = pct >= 50 ? 'text-yes-bright' : 'text-no-bright';
  return (
    <Link
      href={`/markets/${market.collectionId}`}
      className="group block border-t border-ink/30 pt-4"
    >
      {parsed && (
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted">{parsed[1]}</span>
      )}
      <h3 className="mt-2 font-display text-2xl font-semibold leading-tight tracking-marquee text-ink group-hover:text-gold-bright">
        {parsed ? `> $${parsed[2]}` : market.name}
      </h3>
      <p className="mt-3 font-display text-base italic leading-relaxed text-ink-dim">
        Market leans <span className={tone}>{lean}</span>: {(pct >= 50 ? pct : 100 - pct).toFixed(0)}% conviction at quote.
      </p>
    </Link>
  );
}
