'use client';

import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto } from '@/lib/aggregator';
import { parseMarketName } from '@/lib/market-name';
import { useCloseCountdown, BrowseCta } from './Shared';
import { MarketCard } from '@/components/prediction/MarketCard';
import { CliTerminal } from '@/components/CliTerminal';
import { clsx } from 'clsx';
import Link from 'next/link';

/**
 * Variant 7 — Pyramid lifecycle.
 * Centered M wordmark + lifecycle timeline (8 AM → 4:05 PM) with current
 * step glowing. Featured markets below the fold.
 */
const STEPS = [
  { time: '8:00 AM', label: 'Create', desc: 'Strikes generated', minute: 8 * 60 },
  { time: '9:30 AM', label: 'Open', desc: 'Trading begins', minute: 9 * 60 + 30 },
  { time: '4:00 PM', label: 'Close', desc: 'Last quote', minute: 16 * 60 },
  { time: '4:05 PM', label: 'Settle', desc: 'Oracle vote', minute: 16 * 60 + 5 },
];

/**
 * Pick `limit` featured markets that span as many distinct tickers as
 * possible. Without this the list is dominated by one name (every TSLA
 * strike lands first), so we round-robin across tickers: one market per
 * ticker, then a second per ticker, etc. — guaranteeing at least one of
 * each represented name before any name repeats. Falls back gracefully
 * for markets whose name doesn't parse to a ticker.
 */
function diversifyByTicker(markets: MarketDto[], limit: number): MarketDto[] {
  const buckets = new Map<string, MarketDto[]>();
  for (const m of markets) {
    const key = parseMarketName(m.name, m.description)?.ticker ?? m.collectionId;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(m);
  }
  const queues = [...buckets.values()];
  const out: MarketDto[] = [];
  let added = true;
  while (out.length < limit && added) {
    added = false;
    for (const q of queues) {
      const next = q.shift();
      if (!next) continue;
      out.push(next);
      added = true;
      if (out.length >= limit) break;
    }
  }
  return out;
}

function easternMin(): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

export function Landing07() {
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? [];
  const active = markets.filter((m) => m.status === 'active');
  const featured = diversifyByTicker(active, 7);
  const min = easternMin();
  const currentStep = STEPS.reduce((acc, s, i) => (min >= s.minute ? i : acc), -1);

  return (
    <div className="space-y-14 sm:space-y-20">
      <section className="flex flex-col items-center pt-6 text-center sm:pt-12">
        {/* small logo glyph as a "dot of the i"-style accent above the wordmark */}
        <div className="relative mb-4 inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-clay-sm bg-bg shadow-clay-sm sm:h-14 sm:w-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/meridian-logo.png" alt="" width={56} height={56} className="h-full w-full object-cover" />
        </div>
        {/* Wordmark = typographic abstraction of the logo: Unbounded heavy with
            the mark's gold→amber→crimson gradient clipped into the letters. */}
        <h1 className="font-hero text-[clamp(2.75rem,13vw,7.5rem)] font-extrabold leading-[0.9] tracking-[-0.02em]">
          <span className="wordmark-gradient">MERIDIAN</span>
        </h1>

        {/* Prominent chain attribution — clay badge with the BitBadges mark */}
        <a
          href="https://bitbadges.io"
          target="_blank"
          rel="noreferrer"
          className="group mt-6 inline-flex items-center gap-2.5 rounded-full bg-panel-2 py-2 pl-2.5 pr-4 shadow-clay-sm transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chains/bitbadges.png" alt="BitBadges" width={28} height={28} className="h-full w-full object-cover" />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim">
            Powered by{' '}
            <span className="font-semibold text-gold-bright transition-colors group-hover:text-gold">
              BitBadges
            </span>
          </span>
          <span className="font-mono text-[11px] text-faint transition-transform group-hover:translate-x-0.5">↗</span>
        </a>

        <p className="mt-6 max-w-lg px-2 text-sm text-ink-dim sm:text-base">
          Daily MAG7 binary outcome markets, built by Trevor&nbsp;Miller on
          BitBadges, the chain he founded.
        </p>

        {/* Lifecycle timeline */}
        <div className="mt-12 w-full max-w-3xl sm:mt-16">
          <div className="relative">
            <div className="absolute left-0 right-0 top-3 h-px bg-border sm:top-3.5" />
            <div className="relative grid grid-cols-4 gap-2 sm:gap-4">
              {STEPS.map((s, i) => {
                const isPast = currentStep > i;
                const isCurrent = currentStep === i;
                return (
                  <div key={s.label} className="flex flex-col items-center">
                    <div
                      className={clsx(
                        'h-6 w-6 rounded-full border-2 transition-all sm:h-7 sm:w-7',
                        isCurrent ? 'border-gold bg-gold shadow-[0_0_24px_4px_rgba(232,177,74,0.5)] animate-pulse-soft'
                          : isPast ? 'border-gold/60 bg-gold/40'
                          : 'border-border-bright bg-bg',
                      )}
                    />
                    <span className={clsx(
                      'mt-2 font-mono text-[9px] tracking-[0.1em] uppercase sm:mt-3 sm:text-[10px] sm:tracking-[0.14em]',
                      isCurrent ? 'text-gold' : isPast ? 'text-ink' : 'text-muted',
                    )}>
                      {s.time}
                    </span>
                    <span className={clsx(
                      'mt-1 font-display text-sm font-semibold tracking-marquee sm:text-base',
                      isCurrent ? 'text-gold-bright' : 'text-ink-dim',
                    )}>
                      {s.label}
                    </span>
                    <span className="mt-0.5 hidden text-[10px] text-faint sm:block">{s.desc}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-14 flex items-center justify-center">
          <BrowseCta />
        </div>

        {/* Hero CLI — every market here is just BitBadges CLI calls. */}
        <div className="mt-14 w-full text-left sm:mt-16">
          <p className="mb-3 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
            …or spin one up from your terminal
          </p>
          <CliTerminal />
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between border-b border-border pb-2">
          <span className="eyebrow">Active markets · {active.length}</span>
          <Link href="/markets" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-gold">
            All →
          </Link>
        </div>
        {/* Full market cards — same component as the browse page (sparkline,
            probability bar, volume), not the condensed tiles. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((m) => (
            <MarketCard key={m.collectionId} market={m} />
          ))}
        </div>
      </section>
    </div>
  );
}
