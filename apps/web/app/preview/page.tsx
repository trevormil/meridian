'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * Side-by-side preview of all 10 landing variants. Each rendered inside a
 * scaled-down iframe so the full layout (including the header + trading-day
 * timeline) is visible. Click the title chip to open the variant full-screen.
 */
const VARIANTS = [
  { id: '1', label: 'Bloomberg terminal', blurb: 'Max-density live data wall' },
  { id: '2', label: 'Single question', blurb: 'Brutalist · one market, rotates' },
  { id: '3', label: 'The clock', blurb: 'Settle countdown as centerpiece' },
  { id: '4', label: 'Editorial / NYT', blurb: 'Magazine, drop-cap intro' },
  { id: '5', label: 'Ledger split-screen', blurb: 'Brand left, live data right' },
  { id: '6', label: 'Marquee + explainer', blurb: 'Ticker tape + 3-step' },
  { id: '7', label: 'Pyramid lifecycle', blurb: 'Brand-forward timeline' },
  { id: '8', label: "Biggest movers", blurb: 'Activity-first, mover cards' },
  { id: '9', label: 'Glossy fintech', blurb: 'Stripe / Linear feel' },
  { id: '10', label: 'Asymmetric brutalist', blurb: 'Off-grid + broken layout' },
];

const COLS_BY_DENSITY: Record<string, string> = {
  loose: 'lg:grid-cols-2',
  med: 'lg:grid-cols-3',
  tight: 'lg:grid-cols-4',
};

export default function PreviewPage() {
  const [density, setDensity] = useState<'loose' | 'med' | 'tight'>('med');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Design review</span>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-marquee text-ink">
            Landing variants
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-dim">
            10 directions for the Meridian home page. Each iframe renders the full
            layout — header, trading-day bar, content. Click a card to open the
            variant in a full tab.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded border border-border bg-panel-2 p-1">
          {(['loose', 'med', 'tight'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className={`rounded px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
                density === d ? 'bg-gold/15 text-gold-bright' : 'text-muted hover:text-ink'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 md:grid-cols-2 ${COLS_BY_DENSITY[density]}`}>
        {VARIANTS.map((v) => (
          <VariantCard key={v.id} variant={v} density={density} />
        ))}
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  density,
}: {
  variant: { id: string; label: string; blurb: string };
  density: 'loose' | 'med' | 'tight';
}) {
  const height = density === 'loose' ? 720 : density === 'med' ? 540 : 380;
  const scale = density === 'loose' ? 0.7 : density === 'med' ? 0.55 : 0.4;
  const inv = 1 / scale;
  return (
    <div className="overflow-hidden rounded border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border bg-panel-2 px-3 py-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-[0.14em] text-gold">#{variant.id}</span>
          <span className="font-display text-sm font-semibold text-ink">{variant.label}</span>
          <span className="hidden font-mono text-[10px] text-faint sm:inline">{variant.blurb}</span>
        </div>
        <Link
          href={`/landing/${variant.id}`}
          target="_blank"
          className="rounded-sm border border-border bg-bg-deep px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-gold/40 hover:text-gold"
        >
          Open ↗
        </Link>
      </div>
      <div className="relative overflow-hidden bg-bg" style={{ height: `${height}px` }}>
        <iframe
          src={`/landing/${variant.id}`}
          title={variant.label}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: `${100 * inv}%`,
            height: `${100 * inv}%`,
            transform: `scale(${scale})`,
          }}
          loading="lazy"
        />
      </div>
    </div>
  );
}
