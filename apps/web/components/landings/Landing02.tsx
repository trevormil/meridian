'use client';

import { useEffect, useState } from 'react';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import type { MarketDto } from '@/lib/aggregator';
import { BrowseCta, PoweredBy } from './Shared';

/**
 * Variant 2 — The single question.
 * Brutalist minimal. One market's question center-page in massive Fraunces.
 * Auto-rotates every 6s through the day's markets. Two giant YES/NO blocks.
 */
export function Landing02() {
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? [];
  const featured = markets.filter((m) => m.status === 'active' && m.name);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (featured.length === 0) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % featured.length), 6000);
    return () => clearInterval(id);
  }, [featured.length]);

  if (featured.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-faint">No markets yet.</p>
      </div>
    );
  }

  const m = featured[idx % featured.length];
  const parsed = (m.name ?? '').match(/^([A-Z]{1,6})\s*[>≥]\s*\$([0-9,]+)/);
  const yesPct = (m.yesPrice * 100).toFixed(0);
  const noPct = (m.noPrice * 100).toFixed(0);

  return (
    <div className="flex min-h-[78vh] flex-col items-center justify-center text-center">
      <span className="eyebrow mb-6 text-faint">Today · {idx + 1} of {featured.length}</span>
      {parsed ? (
        <h1 className="font-display text-5xl font-medium leading-[0.95] tracking-marquee text-ink md:text-7xl lg:text-8xl">
          Will <span className="text-gold-bright">{parsed[1]}</span>
          <br />
          close above ${parsed[2]}
          <br />
          today?
        </h1>
      ) : (
        <h1 className="font-display text-4xl font-medium leading-tight text-ink">
          {m.name}
        </h1>
      )}

      <div className="mt-14 flex gap-3">
        <SideBlock side="yes" pct={yesPct} href={`/markets/${m.collectionId}`} />
        <SideBlock side="no" pct={noPct} href={`/markets/${m.collectionId}`} />
      </div>

      <div className="mt-14 flex items-center gap-6">
        <BrowseCta label="All markets" variant="arrow" />
        <span className="text-faint">·</span>
        <PoweredBy />
      </div>

      <div className="mt-10 flex gap-1.5">
        {featured.slice(0, Math.min(12, featured.length)).map((_, i) => (
          <span
            key={i}
            className={`h-1 w-6 rounded-sm transition-colors ${i === idx % featured.length ? 'bg-gold' : 'bg-border'}`}
          />
        ))}
      </div>
    </div>
  );
}

function SideBlock({ side, pct, href }: { side: 'yes' | 'no'; pct: string; href: string }) {
  const tone = side === 'yes'
    ? 'border-yes/40 bg-yes/10 hover:border-yes hover:bg-yes/20 text-yes-bright'
    : 'border-no/40 bg-no/10 hover:border-no hover:bg-no/20 text-no-bright';
  return (
    <a
      href={href}
      className={`flex h-32 w-44 flex-col items-center justify-center rounded border-2 transition-all ${tone}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-70">{side.toUpperCase()}</span>
      <span className="mt-2 font-mono text-5xl font-semibold">{pct}<span className="text-2xl">%</span></span>
    </a>
  );
}
