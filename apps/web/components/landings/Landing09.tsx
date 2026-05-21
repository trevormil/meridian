'use client';

import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto } from '@/lib/aggregator';
import { BrowseCta, PoweredBy } from './Shared';

/**
 * Variant 9 — Glossy fintech.
 * Premium pitch page. Hero pitch + 3-column value props + how-it-works strip.
 * Slow scroll, generous breathing room. Stripe/Linear influenced.
 */
export function Landing09() {
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? [];
  const active = markets.filter((m) => m.status === 'active').length;

  return (
    <div className="space-y-32">
      <section className="pt-12 text-center">
        <span className="eyebrow text-gold">Live on-chain · MAG7</span>
        <h1 className="mt-6 font-display text-7xl font-semibold leading-[0.95] tracking-marquee text-ink md:text-8xl">
          Daily binary markets,
          <br />
          <span className="text-gold-bright">oracle-settled.</span>
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-ink-dim">
          Trade YES/NO outcomes on whether the seven largest US tech equities close
          above today's strike prices. $1 USDC binary payout. Non-custodial. No KYC.
        </p>
        <div className="mt-12 flex justify-center gap-4">
          <BrowseCta label="Browse markets" />
          <BrowseCta label="View docs" variant="ghost" />
        </div>
        <div className="mt-8 font-mono text-[11px] tracking-[0.16em] text-faint">
          {active} markets live · settle at 4:05 PM ET
        </div>
      </section>

      <section>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-border bg-border md:grid-cols-3">
          <Pillar
            title="Non-custodial"
            body="You hold your keys. Every trade is your signature, every settlement is an on-chain vote."
            num="01"
          />
          <Pillar
            title="Auto-settled"
            body="Oracle reads the official close at 4:05 PM ET and casts a single on-chain vote. Winners redeem 1:1 for USDC."
            num="02"
          />
          <Pillar
            title="No KYC"
            body="Connect a wallet. Mint a pair. Trade. Redeem. That's the whole flow."
            num="03"
          />
        </div>
      </section>

      <section>
        <div className="mb-10 text-center">
          <span className="eyebrow">How it works</span>
          <h2 className="mt-4 font-display text-4xl font-semibold tracking-marquee text-ink">
            Four steps. One trading day.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[
            { n: '01', t: 'Pick', d: 'Browse the day\'s MAG7 strikes' },
            { n: '02', t: 'Mint', d: 'Deposit $1 USDC → 1 YES + 1 NO' },
            { n: '03', t: 'Trade', d: 'Sell the side you don\'t want' },
            { n: '04', t: 'Redeem', d: 'Winning side claims $1 USDC each' },
          ].map((s) => (
            <div key={s.n} className="rounded border border-border bg-panel p-5">
              <div className="font-mono text-[10px] tracking-[0.18em] text-gold">STEP {s.n}</div>
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-marquee text-ink">{s.t}</h3>
              <p className="mt-2 text-sm text-ink-dim">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border pt-16 text-center">
        <h2 className="font-display text-4xl font-semibold tracking-marquee text-ink">
          Open the market.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm text-ink-dim">
          {active} questions on the day's MAG7 closes, all live now.
        </p>
        <div className="mt-8 flex justify-center">
          <BrowseCta />
        </div>
        <div className="mt-12">
          <PoweredBy />
        </div>
      </section>
    </div>
  );
}

function Pillar({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="bg-panel p-8">
      <div className="font-mono text-[10px] tracking-[0.18em] text-gold">{num}</div>
      <h3 className="mt-4 font-display text-2xl font-semibold tracking-marquee text-ink">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-dim">{body}</p>
    </div>
  );
}
