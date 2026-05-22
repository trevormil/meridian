'use client';

import Link from 'next/link';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto } from '@/lib/aggregator';
import { BrowseCta, PoweredBy } from './Shared';

/**
 * Variant 10 — Asymmetric brutalist.
 * Off-grid editorial. MERIDIAN slams the top-left full-bleed, tagline right,
 * diagonal hairline divider, broken market grid below.
 */
export function Landing10() {
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? [];
  const active = markets.filter((m) => m.status === 'active');
  const featured = active[0];

  return (
    <div className="space-y-0">
      <section className="-mx-6 grid grid-cols-1 gap-6 px-6 pt-2 md:grid-cols-[1.4fr_1fr]">
        <h1 className="font-display text-[clamp(5rem,17vw,14rem)] font-semibold leading-[0.82] tracking-[-0.04em] text-ink">
          MER
          <br />
          IDI
          <br />
          AN
        </h1>
        <div className="flex flex-col justify-end pb-6">
          <span className="eyebrow text-gold">↳ daily</span>
          <p className="mt-3 font-display text-2xl leading-tight tracking-marquee text-ink-dim md:text-3xl">
            Binary outcome markets on the seven largest US tech equities.
            <br />
            <span className="text-gold-bright">$1 USDC. One day. One settle.</span>
          </p>
          <div className="mt-8 flex items-center gap-4">
            <BrowseCta variant="ghost" />
            <PoweredBy tone="card" />
          </div>
        </div>
      </section>

      {/* Diagonal divider */}
      <div className="relative my-12 h-px overflow-hidden">
        <div
          className="absolute left-0 top-0 h-px w-[200%] origin-left bg-gradient-to-r from-transparent via-gold/40 to-transparent"
          style={{ transform: 'rotate(-1deg)' }}
        />
      </div>

      {/* Asymmetric grid: 3 small, 1 hero, 4 small */}
      <section className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {active.slice(0, 3).map((m) => (
            <SmallTile key={m.collectionId} market={m} />
          ))}
        </div>

        {featured && (
          <div className="relative overflow-hidden rounded border border-gold/30 bg-panel p-10 transition-all hover:border-gold/60">
            <Link href={`/markets/${featured.collectionId}`} className="group flex flex-col items-start gap-6">
              <span className="eyebrow text-gold">Featured</span>
              <h2 className="font-display text-5xl font-semibold leading-none tracking-marquee text-ink group-hover:text-gold-bright md:text-7xl">
                {featured.name?.replace(/^\[[^\]]+]\s*/, '') ?? 'Market'}
              </h2>
              <div className="flex items-baseline gap-4 font-mono text-lg">
                <span className="text-yes">YES {(featured.yesPrice * 100).toFixed(0)}%</span>
                <span className="text-faint">·</span>
                <span className="text-no">NO {(featured.noPrice * 100).toFixed(0)}%</span>
              </div>
            </Link>
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gold/10 blur-3xl"
              aria-hidden
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {active.slice(3, 7).map((m) => (
            <SmallTile key={m.collectionId} market={m} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          {active.slice(7, 13).map((m) => (
            <SmallTile key={m.collectionId} market={m} />
          ))}
        </div>
      </section>

      <div className="my-12 flex justify-end">
        <BrowseCta label="See all markets" variant="arrow" />
      </div>
    </div>
  );
}

function SmallTile({ market }: { market: MarketDto }) {
  const parsed = (market.name ?? '').match(/^([A-Z]{1,6})\s*[>≥]\s*\$([0-9,]+)/);
  return (
    <Link
      href={`/markets/${market.collectionId}`}
      className="group flex items-baseline justify-between border-t border-ink/30 pt-3 transition-colors hover:border-gold"
    >
      <div>
        {parsed && (
          <div className="font-mono text-[9px] tracking-[0.16em] text-muted">{parsed[1]}</div>
        )}
        <div className="font-display text-lg text-ink group-hover:text-gold-bright">
          {parsed ? `≥ $${parsed[2]}` : market.name}
        </div>
      </div>
      <div className="font-mono text-sm text-yes">{(market.yesPrice * 100).toFixed(0)}%</div>
    </Link>
  );
}
