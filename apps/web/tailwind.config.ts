import type { Config } from 'tailwindcss';

/**
 * Meridian design tokens — "heat at midnight".
 *
 * Palette pulled directly from the brand mark (gold→amber→crimson gradient on
 * warm charcoal). The rule: champagne for things at-rest, vivid gold for
 * actionable items only, crimson exclusively for NO outcomes and destructive
 * actions. No purple, no blue, no green — those would dilute the identity.
 *
 * Typography pairing: Fraunces (high-contrast serif w/ opsz axis, used only
 * for hero marquee + market names) + Switzer (geometric sans for UI labels
 * and body) + JetBrains Mono (every number, every address).
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './contexts/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Surfaces — warm charcoal scale ──────────────────────────────
        bg: '#0B0908',
        panel: '#15110E',
        'panel-2': '#1E1814',
        'panel-3': '#26201A',
        'bg-deep': '#1E1814',
        border: '#2A231D',
        'border-hi': '#3D332B',
        'border-bright': '#5A4B3D',

        // ── Text — warm ivory scale ─────────────────────────────────────
        ink: '#F5EFDF',
        'ink-dim': '#B8AC9A',
        muted: '#7A7060',
        faint: '#5A5247',

        // ── Logo palette ────────────────────────────────────────────────
        gold: '#E8B14A',
        'gold-bright': '#F4C766',
        'gold-deep': '#8A6A28',
        amber: '#E08A2A',

        // ── Outcomes — green/red. Trader-natural; not from logo. ────────
        // The logo's gold/crimson stays reserved for brand chrome + CTAs;
        // outcome colors follow the prediction-market convention.
        yes: '#22C55E',
        'yes-bright': '#4ADE80',
        'yes-soft': 'rgba(34, 197, 94, 0.10)',
        no: '#EF4444',
        'no-bright': '#F87171',
        'no-soft': 'rgba(239, 68, 68, 0.10)',

        // ── Legacy aliases (older components still reference these) ─────
        accent: '#E8B14A',
        'accent-2': '#D93826',
      },
      fontFamily: {
        // Clay design language: Baloo 2 (rounded) for display + body, mono for numerics.
        display: ['var(--font-baloo)', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['var(--font-baloo)', 'ui-rounded', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // Hero wordmark only — the typographic abstraction of the logo mark.
        hero: ['var(--font-hero)', 'var(--font-baloo)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'panel-gradient':
          'linear-gradient(180deg, rgba(232,177,74,0.04) 0%, rgba(232,177,74,0) 100%)',
        'hero-radial':
          'radial-gradient(ellipse 60% 40% at top, rgba(232,177,74,0.10), transparent 60%)',
        'yes-gradient':
          'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.04))',
        'no-gradient':
          'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.04))',
        'gold-gradient':
          'linear-gradient(180deg, #F4C766 0%, #E8B14A 50%, #C7943A 100%)',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.5), 0 4px 16px -8px rgba(0,0,0,0.6)',
        lift: '0 4px 32px -8px rgba(232,177,74,0.18), 0 1px 2px rgba(0,0,0,0.5)',
        glow: '0 0 0 1px rgba(232,177,74,0.35), 0 8px 32px -8px rgba(232,177,74,0.35)',
        'glow-no':
          '0 0 0 1px rgba(217,56,38,0.35), 0 8px 32px -8px rgba(217,56,38,0.35)',
        'hairline-t': 'inset 0 1px 0 rgba(245,239,223,0.04)',
        // ── Clay system: puffy depth from shadows, not borders ──
        // A solid "base" offset (the block sitting on a surface) + soft ambient
        // blur + an inset top highlight (light catching the rounded top edge).
        clay: '0 12px 0 -3px #0A0705, 0 22px 40px -18px rgba(0,0,0,0.7), inset 0 2px 6px rgba(245,239,223,0.07)',
        'clay-sm': '0 6px 0 -2px #0A0705, 0 12px 22px -12px rgba(0,0,0,0.65), inset 0 1px 4px rgba(245,239,223,0.06)',
        // Pressed: base shrinks (block pushed toward the surface).
        'clay-pressed': '0 3px 0 -2px #0A0705, 0 6px 14px -10px rgba(0,0,0,0.6), inset 0 1px 3px rgba(245,239,223,0.05)',
        // Recessed (inputs): carved into the surface.
        'clay-inset': 'inset 0 3px 7px rgba(0,0,0,0.55), inset 0 -1px 2px rgba(245,239,223,0.05)',
        // Gold CTA puffy base.
        'clay-gold': '0 10px 0 -3px #8A6A28, 0 18px 30px -16px rgba(232,177,74,0.5), inset 0 2px 4px rgba(255,255,255,0.25)',
        'clay-gold-pressed': '0 3px 0 -2px #8A6A28, 0 6px 14px -10px rgba(232,177,74,0.45), inset 0 1px 3px rgba(255,255,255,0.2)',
      },
      borderRadius: {
        // Clay radii — soft, generous. Cards big, controls pill-ish.
        clay: '22px',
        'clay-lg': '28px',
        'clay-sm': '14px',
      },
      animation: {
        'slide-up': 'slideUp 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fadeIn 300ms ease-out both',
        'fade-in-up': 'fadeInUp 480ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-soft': 'pulseSoft 2.8s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px) scale(0.99)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        pulseSoft: {
          '0%,100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(232,177,74,0.0)' },
          '50%': { boxShadow: '0 0 24px 4px rgba(232,177,74,0.2)' },
        },
      },
      letterSpacing: {
        marquee: '-0.02em',
        eyebrow: '0.18em',
      },
    },
  },
  plugins: [],
};
export default config;
