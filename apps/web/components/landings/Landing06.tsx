'use client';

import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto } from '@/lib/aggregator';
import { BrowseCta, PoweredBy } from './Shared';

/**
 * Variant 6 — Marquee strip + explainer.
 * Scrolling ticker at top, hero pitch, three explainer cards. Marketing rhythm.
 */
export function Landing06() {
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? [];
  const active = markets.filter((m) => m.status === 'active');

  return (
    <div className="space-y-16">
      {/* Marquee strip */}
      <div className="-mx-6 overflow-hidden border-y border-border bg-gradient-to-r from-bg via-panel-2 to-bg py-3">
        <div className="ticker-track flex gap-12 whitespace-nowrap font-mono text-sm">
          {[...active, ...active].slice(0, 28).map((m, i) => {
            const parsed = (m.name ?? '').match(/^([A-Z]{1,6})\s*[>≥]\s*\$([0-9,]+)/);
            const pct = (m.yesPrice * 100).toFixed(0);
            return (
              <span key={`${m.collectionId}-${i}`} className="inline-flex items-center gap-2">
                {parsed && <span className="text-muted">{parsed[1]}</span>}
                {parsed && <span className="text-ink">≥${parsed[2]}</span>}
                <span className={Number(pct) >= 50 ? 'text-yes' : 'text-no'}>{pct}%</span>
                <span className="text-faint">·</span>
              </span>
            );
          })}
        </div>
      </div>

      <section className="mx-auto max-w-3xl text-center">
        <span className="eyebrow text-gold mb-6 block">MAG7 · daily · 0DTE</span>
        <h1 className="font-display text-6xl font-semibold leading-[1.0] tracking-marquee text-ink md:text-7xl">
          Bet on daily stock
          <br />
          prices, <span className="text-gold-bright">on chain</span>.
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-ink-dim">
          Trade YES/NO contracts on whether AAPL, MSFT, GOOGL, AMZN, NVDA, META,
          or TSLA close above a strike today. Settles via oracle vote at 4:05 PM ET.
          $1 USDC binary payout.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <BrowseCta />
          <a href="#how" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted hover:text-gold">
            How it works ↓
          </a>
        </div>
      </section>

      <section id="how">
        <div className="mb-8 text-center">
          <span className="eyebrow">How it works</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StepCard
            num="01"
            title="Mint a pair"
            body="Deposit $1 USDC. The chain mints you 1 YES + 1 NO token, both tradeable."
            accent="gold"
          />
          <StepCard
            num="02"
            title="Trade either side"
            body="Sell YES if you think the stock won't close above strike. Sell NO if it will."
            accent="yes"
          />
          <StepCard
            num="03"
            title="Redeem winner"
            body="After 4:05 PM ET settle, your winning side redeems for $1 USDC each. Indefinitely."
            accent="no"
          />
        </div>
      </section>

      <div className="border-t border-border pt-8 text-center">
        <PoweredBy />
      </div>

      <style jsx>{`
        @keyframes ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        :global(.ticker-track) {
          animation: ticker 60s linear infinite;
        }
      `}</style>
    </div>
  );
}

function StepCard({ num, title, body, accent }: { num: string; title: string; body: string; accent: 'gold' | 'yes' | 'no' }) {
  const tone = {
    gold: 'text-gold',
    yes: 'text-yes',
    no: 'text-no',
  }[accent];
  return (
    <div className="rounded border border-border bg-panel p-6 transition-colors hover:border-gold/30">
      <div className={`font-mono text-[10px] tracking-[0.18em] uppercase ${tone}`}>STEP {num}</div>
      <h3 className="mt-3 font-display text-2xl font-semibold tracking-marquee text-ink">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-dim">{body}</p>
    </div>
  );
}
