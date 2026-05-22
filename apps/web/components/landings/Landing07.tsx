'use client';

import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto } from '@/lib/aggregator';
import { useCloseCountdown, BrowseCta, PoweredBy } from './Shared';
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
      <section className="flex flex-col items-center pt-4 text-center sm:pt-8">
        <div className="relative inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-gold/30 bg-bg shadow-[0_0_56px_-8px_rgba(232,177,74,0.5)] sm:h-24 sm:w-24">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/meridian-logo.png" alt="" width={96} height={96} className="h-full w-full object-cover" />
        </div>
        <h1 className="mt-5 font-display text-5xl font-semibold leading-none tracking-marquee text-ink sm:mt-8 sm:text-7xl md:text-8xl">
          Meridian
        </h1>
        <p className="mt-4 max-w-md px-2 text-sm text-ink-dim">
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

        <div className="mt-14 flex items-center gap-4">
          <BrowseCta />
          <span className="text-faint">·</span>
          <PoweredBy />
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
