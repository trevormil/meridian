'use client';

import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto } from '@/lib/aggregator';
import { useCloseCountdown, BrowseCta } from './Shared';
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

        <p className="mt-6 max-w-md px-2 text-sm text-ink-dim sm:text-base">
          Daily MAG7 binary outcome markets. One trading day, one settle, one $1 USDC payout per winning token.
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
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between border-b border-border pb-2">
          <span className="eyebrow">Active markets · {active.length}</span>
          <Link href="/markets" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-gold">
            All →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          {active.slice(0, 12).map((m) => {
            const parsed = (m.name ?? '').match(/^([A-Z]{1,6})\s*[>≥]\s*\$([0-9,]+)/);
            return (
              <Link
                key={m.collectionId}
                href={`/markets/${m.collectionId}`}
                className="group rounded border border-border bg-panel p-3 transition-colors hover:border-gold/40"
              >
                {parsed && (
                  <div className="font-mono text-[10px] tracking-[0.14em] text-muted">{parsed[1]}</div>
                )}
                <div className="mt-1 truncate font-display text-base text-ink group-hover:text-gold-bright">
                  {parsed ? `≥ $${parsed[2]}` : m.name}
                </div>
                <div className="mt-2 font-mono text-sm text-yes">{(m.yesPrice * 100).toFixed(0)}%</div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
