import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './contexts/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: '#07070a',
        panel: '#111118',
        'panel-2': '#181820',
        border: '#26262d',
        'border-hi': '#3a3a44',
        // Text
        ink: '#f5f5f7',
        muted: '#8a8a96',
        // Brand
        accent: '#3b82f6',
        'accent-2': '#8b5cf6',
        yes: '#22c55e',
        'yes-soft': '#0d3a1c',
        no: '#ef4444',
        'no-soft': '#3a0d1c',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      backgroundImage: {
        'panel-gradient': 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%)',
        'hero-radial': 'radial-gradient(ellipse at top, rgba(59,130,246,0.15), transparent 60%)',
        'yes-gradient': 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.05))',
        'no-gradient': 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.05))',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.4), 0 4px 16px -8px rgba(0,0,0,0.5)',
        lift: '0 4px 24px -8px rgba(59,130,246,0.25), 0 1px 2px rgba(0,0,0,0.4)',
        glow: '0 0 0 1px rgba(59,130,246,0.3), 0 8px 32px -8px rgba(59,130,246,0.3)',
      },
      animation: {
        'slide-up': 'slideUp 200ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSoft: {
          '0%,100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
