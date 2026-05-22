'use client';

import { useState } from 'react';

/**
 * /themes — design-direction preview gallery.
 *
 * Ten themes of the SAME representative UI slice (brand chrome + a market
 * card + probability bar + mini order book), all within the locked
 * heat-at-midnight color world (charcoal / gold / champagne / green-red / ink).
 * Everything else varies per theme: type pairing, shape language, density,
 * surface + border treatment, texture, motion. Pick one to roll out app-wide.
 *
 * Each theme is a CSS-variable + data-signature driven restyle of one shared
 * slice markup, with signature ornaments (scanlines, hard shadows, deco
 * frames, warning stripes, glass blur, phosphor glow) layered via scoped CSS.
 */

const PALETTE = {
  bg: '#0B0908',
  panel: '#15110E',
  panel2: '#1E1814',
  border: '#2A231D',
  borderHi: '#3D332B',
  ink: '#F5EFDF',
  inkDim: '#B8AC9A',
  faint: '#7A7060',
  gold: '#E8B14A',
  goldBright: '#F4C766',
  yes: '#22C55E',
  no: '#EF4444',
};

interface Theme {
  id: string;
  name: string;
  blurb: string;
  vars: Record<string, string>;
  sig: string; // signature ornament key
}

const THEMES: Theme[] = [
  {
    id: 'terminal',
    name: 'Terminal',
    blurb: 'Bloomberg-dense · all-mono · hairline grid',
    sig: 'scanlines',
    vars: {
      '--fd': "'JetBrains Mono', monospace",
      '--fb': "'JetBrains Mono', monospace",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '0px',
      '--cardBg': '#100C09',
      '--cardBorder': '1px solid #2A231D',
      '--shadow': 'none',
      '--pad': '12px',
      '--gap': '8px',
      '--titleSize': '20px',
      '--titleWeight': '600',
      '--titleTransform': 'uppercase',
      '--titleSpacing': '0.04em',
    },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    blurb: 'Magazine · big Fraunces serif · airy · drop cap',
    sig: 'dropcap',
    vars: {
      '--fd': "'Fraunces', serif",
      '--fb': "'Switzer', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '2px',
      '--cardBg': 'transparent',
      '--cardBorder': '1px solid #2A231D',
      '--shadow': 'none',
      '--pad': '26px',
      '--gap': '18px',
      '--titleSize': '38px',
      '--titleWeight': '500',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.01em',
    },
  },
  {
    id: 'brutalist',
    name: 'Brutalist',
    blurb: 'Anton display · 2px borders · hard offset shadow',
    sig: 'hardshadow',
    vars: {
      '--fd': "'Anton', sans-serif",
      '--fb': "'Archivo', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '0px',
      '--cardBg': '#15110E',
      '--cardBorder': '2px solid #F5EFDF',
      '--shadow': '6px 6px 0 #E8B14A',
      '--pad': '18px',
      '--gap': '14px',
      '--titleSize': '40px',
      '--titleWeight': '400',
      '--titleTransform': 'uppercase',
      '--titleSpacing': '0.01em',
    },
  },
  {
    id: 'luxury',
    name: 'Luxury',
    blurb: 'Cormorant · letterspaced small-caps · gold hairlines',
    sig: 'hairline',
    vars: {
      '--fd': "'Cormorant Garamond', serif",
      '--fb': "'Switzer', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '1px',
      '--cardBg': 'linear-gradient(180deg,#15110E,#100C09)',
      '--cardBorder': '1px solid rgba(232,177,74,0.28)',
      '--shadow': '0 24px 60px -30px rgba(0,0,0,0.8)',
      '--pad': '30px',
      '--gap': '22px',
      '--titleSize': '40px',
      '--titleWeight': '500',
      '--titleTransform': 'none',
      '--titleSpacing': '0.02em',
    },
  },
  {
    id: 'crt',
    name: 'CRT',
    blurb: 'VT323 phosphor · scanlines · text bloom + flicker',
    sig: 'crt',
    vars: {
      '--fd': "'VT323', monospace",
      '--fb': "'VT323', monospace",
      '--fm': "'VT323', monospace",
      '--radius': '0px',
      '--cardBg': '#0C0A07',
      '--cardBorder': '1px solid rgba(232,177,74,0.4)',
      '--shadow': 'inset 0 0 60px -20px rgba(232,177,74,0.25)',
      '--pad': '16px',
      '--gap': '6px',
      '--titleSize': '34px',
      '--titleWeight': '400',
      '--titleTransform': 'uppercase',
      '--titleSpacing': '0.02em',
    },
  },
  {
    id: 'soft',
    name: 'Soft Fintech',
    blurb: 'Rounded-2xl · pill buttons · soft shadows · gentle',
    sig: 'soft',
    vars: {
      '--fd': "'Fraunces', serif",
      '--fb': "'Switzer', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '20px',
      '--cardBg': 'linear-gradient(165deg,#1A1410,#120E0B)',
      '--cardBorder': '1px solid #2A231D',
      '--shadow': '0 18px 40px -24px rgba(0,0,0,0.7)',
      '--pad': '22px',
      '--gap': '16px',
      '--titleSize': '30px',
      '--titleWeight': '600',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.01em',
    },
  },
  {
    id: 'deco',
    name: 'Art Deco',
    blurb: 'Marcellus · gold double-rule frame · chamfers · symmetry',
    sig: 'deco',
    vars: {
      '--fd': "'Marcellus', serif",
      '--fb': "'Switzer', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '0px',
      '--cardBg': '#100C09',
      '--cardBorder': '1px solid rgba(232,177,74,0.5)',
      '--shadow': 'none',
      '--pad': '24px',
      '--gap': '16px',
      '--titleSize': '34px',
      '--titleWeight': '400',
      '--titleTransform': 'uppercase',
      '--titleSpacing': '0.12em',
    },
  },
  {
    id: 'industrial',
    name: 'Industrial',
    blurb: 'Archivo condensed · warning stripes · metal plate · stencil',
    sig: 'industrial',
    vars: {
      '--fd': "'Archivo', sans-serif",
      '--fb': "'Archivo', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '2px',
      '--cardBg': 'linear-gradient(180deg,#1C1610,#13100C)',
      '--cardBorder': '2px solid #3D332B',
      '--shadow': 'inset 0 1px 0 rgba(245,239,223,0.06)',
      '--pad': '16px',
      '--gap': '12px',
      '--titleSize': '32px',
      '--titleWeight': '800',
      '--titleTransform': 'uppercase',
      '--titleSpacing': '-0.01em',
    },
  },
  {
    id: 'glass',
    name: 'Glass',
    blurb: 'Frosted translucent · backdrop-blur · amplified aurora',
    sig: 'glass',
    vars: {
      '--fd': "'Fraunces', serif",
      '--fb': "'Switzer', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '16px',
      '--cardBg': 'rgba(30,24,20,0.45)',
      '--cardBorder': '1px solid rgba(245,239,223,0.12)',
      '--shadow': '0 20px 50px -28px rgba(0,0,0,0.8)',
      '--pad': '22px',
      '--gap': '16px',
      '--titleSize': '30px',
      '--titleWeight': '600',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.01em',
    },
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    blurb: 'Newsreader serif · near-monochrome · gold for one number',
    sig: 'newsprint',
    vars: {
      '--fd': "'Newsreader', serif",
      '--fb': "'Newsreader', serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '0px',
      '--cardBg': 'transparent',
      '--cardBorder': '1px solid #2A231D',
      '--shadow': 'none',
      '--pad': '20px',
      '--gap': '12px',
      '--titleSize': '30px',
      '--titleWeight': '500',
      '--titleTransform': 'none',
      '--titleSpacing': '0',
    },
  },
];

// Batch 2 — modern + fun.
const THEMES_MODERN: Theme[] = [
  {
    id: 'neopop',
    name: 'Neo-Pop',
    blurb: 'Chunky neobrutalist · colored hard shadows · sticker chips',
    sig: 'neopop',
    vars: {
      '--fd': "'Bricolage Grotesque', sans-serif",
      '--fb': "'Outfit', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '14px',
      '--cardBg': '#181310',
      '--cardBorder': '2.5px solid #F5EFDF',
      '--shadow': '6px 6px 0 #22C55E',
      '--pad': '18px',
      '--gap': '14px',
      '--titleSize': '36px',
      '--titleWeight': '800',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.02em',
    },
  },
  {
    id: 'bento',
    name: 'Bento',
    blurb: 'Modular dashboard tiles · modern fintech app',
    sig: 'bento',
    vars: {
      '--fd': "'Outfit', sans-serif",
      '--fb': "'Outfit', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '14px',
      '--cardBg': '#15110E',
      '--cardBorder': '1px solid #2A231D',
      '--shadow': '0 10px 30px -20px rgba(0,0,0,0.8)',
      '--pad': '14px',
      '--gap': '10px',
      '--titleSize': '30px',
      '--titleWeight': '700',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.02em',
    },
  },
  {
    id: 'mesh',
    name: 'Mesh Glow',
    blurb: 'Vibrant mesh-gradient · glowy soft cards · modern SaaS',
    sig: 'mesh',
    vars: {
      '--fd': "'Bricolage Grotesque', sans-serif",
      '--fb': "'Outfit', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '18px',
      '--cardBg': 'rgba(21,17,14,0.6)',
      '--cardBorder': '1px solid rgba(245,239,223,0.1)',
      '--shadow': '0 20px 50px -30px rgba(232,177,74,0.4)',
      '--pad': '20px',
      '--gap': '16px',
      '--titleSize': '32px',
      '--titleWeight': '600',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.02em',
    },
  },
  {
    id: 'neu',
    name: 'Neumorphic',
    blurb: 'Soft-UI · surfaces extruded from the bg · dual shadows',
    sig: 'neu',
    vars: {
      '--fd': "'Outfit', sans-serif",
      '--fb': "'Outfit', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '20px',
      '--cardBg': '#14100D',
      '--cardBorder': 'none',
      '--shadow': '8px 8px 18px #08060400, -8px -8px 18px #221b1500',
      '--pad': '22px',
      '--gap': '16px',
      '--titleSize': '30px',
      '--titleWeight': '600',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.01em',
    },
  },
  {
    id: 'clay',
    name: 'Clay',
    blurb: 'Puffy claymorphism · big radius · toy-like depth',
    sig: 'clay',
    vars: {
      '--fd': "'Baloo 2', sans-serif",
      '--fb': "'Baloo 2', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '26px',
      '--cardBg': '#1C1611',
      '--cardBorder': 'none',
      '--shadow': '0 14px 0 -2px #0a0705, 0 22px 40px -18px rgba(0,0,0,0.7), inset 0 2px 6px rgba(245,239,223,0.08)',
      '--pad': '22px',
      '--gap': '14px',
      '--titleSize': '32px',
      '--titleWeight': '700',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.01em',
    },
  },
  {
    id: 'kinetic',
    name: 'Kinetic',
    blurb: 'Motion-first · marquee ticker · pulsing live · animated fill',
    sig: 'kinetic',
    vars: {
      '--fd': "'Bricolage Grotesque', sans-serif",
      '--fb': "'Outfit', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '12px',
      '--cardBg': '#15110E',
      '--cardBorder': '1px solid #3D332B',
      '--shadow': 'none',
      '--pad': '18px',
      '--gap': '14px',
      '--titleSize': '34px',
      '--titleWeight': '800',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.02em',
    },
  },
  {
    id: 'neon',
    name: 'Neon Wire',
    blurb: 'Glowing gold/green outline strokes · wireframe · cyber',
    sig: 'neon',
    vars: {
      '--fd': "'Major Mono Display', monospace",
      '--fb': "'JetBrains Mono', monospace",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '10px',
      '--cardBg': 'rgba(11,9,8,0.6)',
      '--cardBorder': '1px solid rgba(232,177,74,0.6)',
      '--shadow': '0 0 18px -2px rgba(232,177,74,0.4), inset 0 0 18px -8px rgba(232,177,74,0.3)',
      '--pad': '18px',
      '--gap': '14px',
      '--titleSize': '26px',
      '--titleWeight': '400',
      '--titleTransform': 'lowercase',
      '--titleSpacing': '0',
    },
  },
  {
    id: 'holo',
    name: 'Holo',
    blurb: 'Iridescent shifting sheen · animated within the warm range',
    sig: 'holo',
    vars: {
      '--fd': "'Bricolage Grotesque', sans-serif",
      '--fb': "'Outfit', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '16px',
      '--cardBg': '#100C09',
      '--cardBorder': '1.5px solid transparent',
      '--shadow': '0 16px 44px -28px rgba(0,0,0,0.8)',
      '--pad': '20px',
      '--gap': '15px',
      '--titleSize': '32px',
      '--titleWeight': '800',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.02em',
    },
  },
  {
    id: 'tactile',
    name: 'Tactile',
    blurb: 'Glossy beveled surfaces · highlights · modern skeuomorph-lite',
    sig: 'tactile',
    vars: {
      '--fd': "'Outfit', sans-serif",
      '--fb': "'Outfit', sans-serif",
      '--fm': "'JetBrains Mono', monospace",
      '--radius': '16px',
      '--cardBg': 'linear-gradient(180deg,#221A14,#140F0B)',
      '--cardBorder': '1px solid #3D332B',
      '--shadow': '0 12px 28px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(245,239,223,0.12)',
      '--pad': '20px',
      '--gap': '15px',
      '--titleSize': '31px',
      '--titleWeight': '700',
      '--titleTransform': 'none',
      '--titleSpacing': '-0.01em',
    },
  },
  {
    id: 'arcade',
    name: 'Arcade',
    blurb: 'Pixel display · chunky blocks · bright · game-UI fun',
    sig: 'arcade',
    vars: {
      '--fd': "'Silkscreen', monospace",
      '--fb': "'JetBrains Mono', monospace",
      '--fm': "'Silkscreen', monospace",
      '--radius': '4px',
      '--cardBg': '#15110E',
      '--cardBorder': '3px solid #E8B14A',
      '--shadow': '0 0 0 3px #0B0908, 6px 6px 0 0 #2A231D',
      '--pad': '16px',
      '--gap': '14px',
      '--titleSize': '22px',
      '--titleWeight': '400',
      '--titleTransform': 'uppercase',
      '--titleSpacing': '0.02em',
    },
  },
];

export default function ThemesPage() {
  const [cols, setCols] = useState<2 | 3>(2);

  return (
    <>
      {/* Load the characterful display faces for the previews. Scoped to this
          route only — the prod app doesn't ship these. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;800&family=Baloo+2:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Cormorant+Garamond:wght@400;500;600&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500;600&family=Major+Mono+Display&family=Marcellus&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Outfit:wght@400;500;600;700;800&family=Silkscreen:wght@400;700&family=VT323&display=swap"
        rel="stylesheet"
      />

      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">Design review</span>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-marquee text-ink sm:text-5xl">
              Theme directions
            </h1>
            <p className="mt-2 max-w-xl text-sm text-ink-dim">
              Ten takes on the same market slice — same colors, everything else
              different. Pick the feel and I&apos;ll roll it out across the app.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded border border-border bg-panel-2 p-1">
            {([2, 3] as const).map((n) => (
              <button
                key={n}
                onClick={() => setCols(n)}
                className={`rounded px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
                  cols === n ? 'bg-gold/15 text-gold-bright' : 'text-muted hover:text-ink'
                }`}
              >
                {n} col
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <span className="eyebrow text-ink">Batch 1 · Classic</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className={`grid grid-cols-1 gap-6 ${cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
          {THEMES.map((t, i) => (
            <ThemeCard key={t.id} theme={t} index={i + 1} />
          ))}
        </div>

        <div className="flex items-center gap-3 pt-4">
          <span className="eyebrow text-gold">Batch 2 · Modern &amp; Fun</span>
          <span className="h-px flex-1 bg-gold/20" />
        </div>
        <div className={`grid grid-cols-1 gap-6 ${cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
          {THEMES_MODERN.map((t, i) => (
            <ThemeCard key={t.id} theme={t} index={i + 11} />
          ))}
        </div>
      </div>
    </>
  );
}

function ThemeCard({ theme, index }: { theme: Theme; index: number }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-panel">
      {/* label bar */}
      <div className="flex items-center justify-between border-b border-border bg-panel-2 px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] tracking-[0.16em] text-gold">
            {String(index).padStart(2, '0')}
          </span>
          <span className="font-display text-sm font-semibold text-ink">{theme.name}</span>
        </div>
        <span className="hidden font-mono text-[10px] text-faint sm:block">{theme.blurb}</span>
      </div>

      {/* themed slice */}
      <div className="theme-slice" data-sig={theme.sig} style={theme.vars as React.CSSProperties}>
        <Slice />
      </div>

      <ThemeStyles />
    </section>
  );
}

/** Shared representative slice. All visual identity comes from the themed CSS
 *  vars + data-sig signature applied by the wrapper. */
function Slice() {
  return (
    <div className="ts-root">
      {/* brand chrome strip */}
      <div className="ts-chrome">
        <span className="ts-brand">Meridian</span>
        <span className="ts-status">
          <i className="ts-dot" /> MARKETS OPEN
        </span>
        <span className="ts-connect">Connect</span>
      </div>

      {/* market card */}
      <div className="ts-card" data-card>
        <div className="ts-card-head">
          <span className="ts-glyph">AAPL</span>
          <div className="ts-titleblock">
            <span className="ts-eyebrow">AAPL · May 22 close</span>
            <h3 className="ts-title">≥ $280</h3>
          </div>
          <span className="ts-chip">LIVE</span>
        </div>

        <div className="ts-prob">
          <span className="ts-prob-label">YES</span>
          <span className="ts-prob-val">64%</span>
        </div>
        <div className="ts-bar">
          <span className="ts-bar-yes" style={{ width: '64%' }} />
          <span className="ts-bar-no" style={{ width: '36%' }} />
        </div>

        {/* dual-line mini chart */}
        <svg className="ts-spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden>
          <polyline className="ts-spark-yes" points="0,20 14,18 28,21 42,15 56,16 70,11 84,13 100,9" />
          <polyline className="ts-spark-no" points="0,14 14,16 28,13 42,19 56,18 70,23 84,21 100,25" />
        </svg>

        <div className="ts-foot">
          <span className="ts-foot-label">Volume</span>
          <span className="ts-foot-val">$12,480</span>
        </div>
      </div>

      {/* mini order book */}
      <div className="ts-book">
        <div className="ts-book-row" data-side="yes">
          <span>BUY YES</span><span>0.62</span><span>×40</span>
        </div>
        <div className="ts-book-row" data-side="no">
          <span>BUY NO</span><span>0.36</span><span>×25</span>
        </div>
      </div>
    </div>
  );
}

/** All theme styling. Scoped to .theme-slice; reads the CSS vars set per card
 *  + branches on [data-sig] for signature ornaments. */
function ThemeStyles() {
  return (
    <style jsx global>{`
      .theme-slice {
        position: relative;
        padding: var(--pad);
        background:
          radial-gradient(120% 80% at 80% -10%, rgba(232, 177, 74, 0.05), transparent 60%),
          #0d0a07;
        font-family: var(--fb);
        color: #f5efdf;
      }
      .ts-root { display: flex; flex-direction: column; gap: var(--gap); }

      /* chrome */
      .ts-chrome {
        display: flex; align-items: center; gap: 12px;
        padding-bottom: 10px; border-bottom: 1px solid rgba(122,112,96,0.18);
      }
      .ts-brand {
        font-family: var(--fd); font-size: 18px; font-weight: 600;
        text-transform: var(--titleTransform); letter-spacing: var(--titleSpacing);
        color: #f5efdf;
      }
      .ts-status {
        font-family: var(--fm); font-size: 9px; letter-spacing: 0.16em;
        color: #22c55e; display: inline-flex; align-items: center; gap: 6px;
      }
      .ts-dot { width: 6px; height: 6px; border-radius: 999px; background: #22c55e; }
      .ts-connect {
        margin-left: auto; font-family: var(--fm); font-size: 11px;
        color: #0b0908; background: linear-gradient(180deg,#f4c766,#c7943a);
        padding: 5px 12px; border-radius: var(--radius);
      }

      /* card */
      .ts-card {
        position: relative;
        background: var(--cardBg);
        border: var(--cardBorder);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        padding: var(--pad);
        display: flex; flex-direction: column; gap: calc(var(--gap) * 0.7);
      }
      .ts-card-head { display: flex; align-items: flex-start; gap: 12px; }
      .ts-glyph {
        font-family: var(--fm); font-size: 11px; font-weight: 600;
        color: #e8b14a; border: 1px solid rgba(232,177,74,0.3);
        border-radius: var(--radius); padding: 6px 8px; align-self: flex-start;
      }
      .ts-titleblock { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
      .ts-eyebrow {
        font-family: var(--fm); font-size: 9px; letter-spacing: 0.16em;
        text-transform: uppercase; color: #7a7060;
      }
      .ts-title {
        font-family: var(--fd);
        font-size: var(--titleSize); font-weight: var(--titleWeight);
        line-height: 0.95; letter-spacing: var(--titleSpacing);
        text-transform: var(--titleTransform); color: #f5efdf;
      }
      .ts-chip {
        font-family: var(--fm); font-size: 8px; letter-spacing: 0.16em;
        color: #e8b14a; border: 1px solid rgba(232,177,74,0.4);
        border-radius: var(--radius); padding: 3px 6px; align-self: flex-start;
      }

      .ts-prob { display: flex; align-items: baseline; justify-content: space-between; }
      .ts-prob-label {
        font-family: var(--fm); font-size: 9px; letter-spacing: 0.18em;
        text-transform: uppercase; color: #7a7060;
      }
      .ts-prob-val {
        font-family: var(--fm); font-size: 26px; font-weight: 600; color: #4ade80;
        line-height: 1;
      }
      .ts-bar {
        display: flex; height: 8px; overflow: hidden;
        border-radius: var(--radius); border: 1px solid rgba(122,112,96,0.2);
      }
      .ts-bar-yes { background: #22c55e; }
      .ts-bar-no { background: #ef4444; }

      .ts-spark { width: 100%; height: 34px; }
      .ts-spark-yes { fill: none; stroke: #22c55e; stroke-width: 1.6; vector-effect: non-scaling-stroke; }
      .ts-spark-no { fill: none; stroke: #ef4444; stroke-width: 1.4; vector-effect: non-scaling-stroke; }

      .ts-foot {
        display: flex; align-items: center; justify-content: space-between;
        padding-top: 8px; border-top: 1px solid rgba(122,112,96,0.15);
      }
      .ts-foot-label {
        font-family: var(--fm); font-size: 9px; letter-spacing: 0.16em;
        text-transform: uppercase; color: #7a7060;
      }
      .ts-foot-val { font-family: var(--fm); font-size: 14px; color: #f4c766; }

      /* mini order book */
      .ts-book { display: flex; flex-direction: column; gap: 4px; }
      .ts-book-row {
        display: grid; grid-template-columns: 1fr auto auto; gap: 12px;
        font-family: var(--fm); font-size: 11px; padding: 6px 10px;
        border: 1px solid rgba(122,112,96,0.18); border-radius: var(--radius);
      }
      .ts-book-row[data-side='yes'] { color: #4ade80; border-color: rgba(34,197,94,0.25); }
      .ts-book-row[data-side='no'] { color: #f87171; border-color: rgba(239,68,68,0.25); }

      /* ─── signature ornaments ─────────────────────────────────────────── */

      /* terminal + crt: scanlines */
      .theme-slice[data-sig='scanlines']::after,
      .theme-slice[data-sig='crt']::after {
        content: ''; position: absolute; inset: 0; pointer-events: none;
        background: repeating-linear-gradient(
          to bottom, rgba(232,177,74,0.04) 0 1px, transparent 1px 3px
        );
      }
      .theme-slice[data-sig='scanlines'] .ts-brand::after {
        content: '_'; color: #e8b14a; animation: tcaret 1s step-end infinite;
      }
      @keyframes tcaret { 50% { opacity: 0; } }

      /* crt: phosphor bloom + flicker */
      .theme-slice[data-sig='crt'] { color: #f4c766; }
      .theme-slice[data-sig='crt'] .ts-title,
      .theme-slice[data-sig='crt'] .ts-brand,
      .theme-slice[data-sig='crt'] .ts-prob-val {
        color: #f4c766; text-shadow: 0 0 6px rgba(244,199,102,0.55), 0 0 14px rgba(232,177,74,0.3);
        animation: tflicker 4s infinite;
      }
      @keyframes tflicker { 0%,96%,100%{opacity:1} 97%{opacity:0.85} 98%{opacity:1} }

      /* brutalist: keep hard shadow crisp, blocky chip */
      .theme-slice[data-sig='hardshadow'] .ts-chip,
      .theme-slice[data-sig='hardshadow'] .ts-glyph { border-width: 2px; }
      .theme-slice[data-sig='hardshadow'] .ts-connect { box-shadow: 3px 3px 0 #f5efdf; }

      /* editorial: drop-cap-ish oversized eyebrow + serif italic foot */
      .theme-slice[data-sig='dropcap'] .ts-title { font-style: normal; }
      .theme-slice[data-sig='dropcap'] .ts-card { border-left: 3px solid #e8b14a; }

      /* luxury: thin everything, wide tracking */
      .theme-slice[data-sig='hairline'] .ts-title { font-weight: 500; }
      .theme-slice[data-sig='hairline'] .ts-eyebrow,
      .theme-slice[data-sig='hairline'] .ts-prob-label { letter-spacing: 0.3em; }
      .theme-slice[data-sig='hairline'] .ts-connect {
        background: transparent; color: #e8b14a; border: 1px solid rgba(232,177,74,0.4);
      }

      /* soft: pill everything */
      .theme-slice[data-sig='soft'] .ts-bar { border-radius: 999px; }
      .theme-slice[data-sig='soft'] .ts-connect { border-radius: 999px; padding: 6px 16px; }
      .theme-slice[data-sig='soft'] .ts-chip,
      .theme-slice[data-sig='soft'] .ts-glyph,
      .theme-slice[data-sig='soft'] .ts-book-row { border-radius: 999px; }

      /* deco: gold double-rule frame + chamfered corners */
      .theme-slice[data-sig='deco'] .ts-card {
        outline: 1px solid rgba(232,177,74,0.5); outline-offset: -5px;
      }
      .theme-slice[data-sig='deco'] .ts-card::before {
        content: ''; position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
        width: 40px; height: 1px; background: #e8b14a;
      }
      .theme-slice[data-sig='deco'] .ts-title { text-align: center; }
      .theme-slice[data-sig='deco'] .ts-card-head { flex-direction: column; align-items: center; text-align: center; }

      /* industrial: warning stripe header + stencil tracking */
      .theme-slice[data-sig='industrial'] .ts-card::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
        background: repeating-linear-gradient(45deg, #e8b14a 0 8px, #1c1610 8px 16px);
      }
      .theme-slice[data-sig='industrial'] .ts-title { letter-spacing: -0.02em; }
      .theme-slice[data-sig='industrial'] .ts-brand { letter-spacing: 0.04em; }

      /* glass: frosted blur */
      .theme-slice[data-sig='glass'] { backdrop-filter: none; }
      .theme-slice[data-sig='glass'] .ts-card {
        backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      }
      .theme-slice[data-sig='glass']::before {
        content: ''; position: absolute; inset: 0; pointer-events: none;
        background:
          radial-gradient(50% 60% at 15% 20%, rgba(232,177,74,0.16), transparent 70%),
          radial-gradient(50% 60% at 90% 90%, rgba(217,56,38,0.12), transparent 70%);
        filter: blur(10px);
      }

      /* newsprint: monochrome except the volume number */
      .theme-slice[data-sig='newsprint'] .ts-prob-val { color: #f5efdf; }
      .theme-slice[data-sig='newsprint'] .ts-bar-yes { background: #b8ac9a; }
      .theme-slice[data-sig='newsprint'] .ts-bar-no { background: #3d332b; }
      .theme-slice[data-sig='newsprint'] .ts-spark-yes { stroke: #b8ac9a; }
      .theme-slice[data-sig='newsprint'] .ts-spark-no { stroke: #5a4b3d; }
      .theme-slice[data-sig='newsprint'] .ts-connect { background: #f5efdf; }
      .theme-slice[data-sig='newsprint'] .ts-title { border-bottom: 2px solid #2a231d; padding-bottom: 6px; }

      /* ─── batch 2: modern & fun ───────────────────────────────────────── */

      /* neo-pop: chunky, colored hard shadows, sticker chips */
      .theme-slice[data-sig='neopop'] .ts-chip {
        background: #ef4444; color: #0b0908; border: 2px solid #0b0908;
        border-radius: 999px; font-weight: 700; transform: rotate(3deg);
      }
      .theme-slice[data-sig='neopop'] .ts-glyph {
        background: #f4c766; color: #0b0908; border: 2px solid #0b0908; border-radius: 10px;
      }
      .theme-slice[data-sig='neopop'] .ts-connect {
        border: 2px solid #f5efdf; border-radius: 999px; box-shadow: 3px 3px 0 #ef4444;
      }
      .theme-slice[data-sig='neopop'] .ts-book-row { border-width: 2px; }

      /* bento: turn the card internals into modular tiles */
      .theme-slice[data-sig='bento'] .ts-card { background: transparent; border: none; box-shadow: none; padding: 0; gap: 10px; }
      .theme-slice[data-sig='bento'] .ts-card-head,
      .theme-slice[data-sig='bento'] .ts-prob,
      .theme-slice[data-sig='bento'] .ts-foot {
        background: #15110e; border: 1px solid #2a231d; border-radius: 14px; padding: 12px 14px;
      }
      .theme-slice[data-sig='bento'] .ts-prob { flex-direction: column; align-items: flex-start; gap: 4px; }
      .theme-slice[data-sig='bento'] .ts-prob-val { font-size: 30px; }
      .theme-slice[data-sig='bento'] .ts-spark { background: #15110e; border: 1px solid #2a231d; border-radius: 14px; padding: 8px; box-sizing: border-box; height: 56px; }
      .theme-slice[data-sig='bento'] .ts-bar { margin-top: 2px; }

      /* mesh: animated multi-stop gradient backdrop, glassy card */
      .theme-slice[data-sig='mesh'] {
        background:
          radial-gradient(60% 60% at 10% 0%, rgba(232,177,74,0.22), transparent 60%),
          radial-gradient(50% 50% at 100% 30%, rgba(217,56,38,0.18), transparent 60%),
          radial-gradient(60% 60% at 50% 110%, rgba(34,197,94,0.14), transparent 60%),
          #0d0a07;
        background-size: 200% 200%; animation: meshmove 12s ease-in-out infinite;
      }
      @keyframes meshmove { 0%,100%{background-position:0% 0%,100% 30%,50% 100%} 50%{background-position:30% 20%,70% 10%,40% 80%} }
      .theme-slice[data-sig='mesh'] .ts-card { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }

      /* neumorphic: extruded soft surfaces (card bg == slice bg) */
      .theme-slice[data-sig='neu'] { background: #14100d; }
      .theme-slice[data-sig='neu'] .ts-card {
        box-shadow: 9px 9px 20px #0a0705, -9px -9px 20px #1e1813;
      }
      .theme-slice[data-sig='neu'] .ts-glyph,
      .theme-slice[data-sig='neu'] .ts-chip,
      .theme-slice[data-sig='neu'] .ts-book-row {
        border: none; background: #14100d;
        box-shadow: inset 3px 3px 7px #0a0705, inset -3px -3px 7px #1e1813;
      }
      .theme-slice[data-sig='neu'] .ts-bar { border: none; box-shadow: inset 2px 2px 5px #0a0705, inset -2px -2px 5px #1e1813; height: 12px; }
      .theme-slice[data-sig='neu'] .ts-connect { box-shadow: 4px 4px 10px #0a0705, -4px -4px 10px #1e1813; }

      /* clay: puffy + rounded sub-elements */
      .theme-slice[data-sig='clay'] .ts-glyph,
      .theme-slice[data-sig='clay'] .ts-chip,
      .theme-slice[data-sig='clay'] .ts-book-row {
        border: none; border-radius: 16px;
        box-shadow: 0 6px 0 -1px rgba(0,0,0,0.4), inset 0 2px 4px rgba(245,239,223,0.1);
      }
      .theme-slice[data-sig='clay'] .ts-bar { border: none; border-radius: 999px; height: 12px; }
      .theme-slice[data-sig='clay'] .ts-connect { border-radius: 16px; box-shadow: 0 5px 0 -1px #8a6a28; }

      /* kinetic: marquee status, animated bar fill, pulsing dot */
      .theme-slice[data-sig='kinetic'] .ts-dot { animation: kpulse 1.1s ease-in-out infinite; }
      @keyframes kpulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.6)} 50%{box-shadow:0 0 0 5px rgba(34,197,94,0)} }
      .theme-slice[data-sig='kinetic'] .ts-bar-yes { animation: kfill 3s ease-in-out infinite alternate; }
      @keyframes kfill { from{width:52%} to{width:71%} }
      .theme-slice[data-sig='kinetic'] .ts-prob-val { animation: knudge 3s ease-in-out infinite alternate; }
      @keyframes knudge { from{transform:translateY(1px)} to{transform:translateY(-1px)} }
      .theme-slice[data-sig='kinetic'] .ts-connect { transition: transform 0.15s cubic-bezier(0.16,1,0.3,1); }
      .theme-slice[data-sig='kinetic'] .ts-connect:hover { transform: translateY(-2px) scale(1.04); }

      /* neon wire: glowing outlines, transparent fills */
      .theme-slice[data-sig='neon'] { background: #08060a; }
      .theme-slice[data-sig='neon'] .ts-glyph { background: transparent; box-shadow: 0 0 10px -2px rgba(232,177,74,0.5); }
      .theme-slice[data-sig='neon'] .ts-chip { box-shadow: 0 0 8px -2px rgba(232,177,74,0.5); }
      .theme-slice[data-sig='neon'] .ts-title { color: #f4c766; text-shadow: 0 0 10px rgba(244,199,102,0.5); }
      .theme-slice[data-sig='neon'] .ts-prob-val { text-shadow: 0 0 10px rgba(74,222,128,0.6); }
      .theme-slice[data-sig='neon'] .ts-bar { border-color: rgba(232,177,74,0.4); box-shadow: 0 0 10px -3px rgba(232,177,74,0.4); }
      .theme-slice[data-sig='neon'] .ts-book-row { background: transparent; }
      .theme-slice[data-sig='neon'] .ts-connect { background: transparent; color: #f4c766; border: 1px solid rgba(232,177,74,0.6); box-shadow: 0 0 12px -2px rgba(232,177,74,0.5); }

      /* holo: iridescent animated gradient border + title */
      .theme-slice[data-sig='holo'] .ts-card {
        background:
          linear-gradient(#100c09,#100c09) padding-box,
          linear-gradient(120deg,#f4c766,#22c55e,#d93826,#f4c766) border-box;
        background-size: 100% 100%, 300% 300%;
        animation: holoshift 6s linear infinite;
      }
      @keyframes holoshift { to { background-position: 0 0, 300% 0; } }
      .theme-slice[data-sig='holo'] .ts-title {
        background: linear-gradient(120deg,#f4c766,#4ade80,#f87171,#f4c766);
        background-size: 300% 100%; -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent; animation: holoshift 6s linear infinite;
      }
      .theme-slice[data-sig='holo'] .ts-connect { background: linear-gradient(120deg,#f4c766,#22c55e,#f4c766); background-size: 200% 100%; animation: holoshift 4s linear infinite; }

      /* tactile: glossy top highlight on the card + beveled buttons */
      .theme-slice[data-sig='tactile'] .ts-card::before {
        content: ''; position: absolute; inset: 1px 1px auto 1px; height: 40%;
        border-radius: 15px 15px 40% 40%; background: linear-gradient(180deg, rgba(245,239,223,0.07), transparent);
        pointer-events: none;
      }
      .theme-slice[data-sig='tactile'] .ts-connect { box-shadow: inset 0 1px 0 rgba(245,239,223,0.4), 0 4px 10px -4px rgba(0,0,0,0.7); }
      .theme-slice[data-sig='tactile'] .ts-glyph,
      .theme-slice[data-sig='tactile'] .ts-chip { background: linear-gradient(180deg,#221a14,#15100c); box-shadow: inset 0 1px 0 rgba(245,239,223,0.1); }

      /* arcade: pixel, chunky blocks, bright */
      .theme-slice[data-sig='arcade'] { image-rendering: pixelated; background: #0b0908; }
      .theme-slice[data-sig='arcade'] .ts-glyph { background: #22c55e; color: #0b0908; border: 2px solid #0b0908; }
      .theme-slice[data-sig='arcade'] .ts-chip { background: #ef4444; color: #0b0908; border: 2px solid #0b0908; }
      .theme-slice[data-sig='arcade'] .ts-bar { border: 2px solid #0b0908; height: 14px; }
      .theme-slice[data-sig='arcade'] .ts-connect { border: 2px solid #0b0908; box-shadow: 3px 3px 0 #0b0908; }
      .theme-slice[data-sig='arcade'] .ts-book-row { border: 2px solid; }
      .theme-slice[data-sig='arcade'] .ts-prob-val { color: #4ade80; }
    `}</style>
  );
}
