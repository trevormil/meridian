import './globals.css';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import { WalletProvider } from '@/contexts/WalletContext';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { RealtimeWarmup } from '@/components/RealtimeWarmup';
import { ToastProvider } from '@/components/ui/Toasts';
import { OrderFillWatcher } from '@/components/OrderFillWatcher';
import { BrandLogo } from '@/components/BrandLogo';
import { TradingDayBar } from '@/components/TradingDayBar';
import { NavLink } from '@/components/NavLink';
import { MarketStatusPill } from '@/components/MarketStatusPill';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { MobileNav } from '@/components/MobileNav';

/**
 * Fraunces — Google's contemporary serif. Used sparingly for marquee
 * surfaces (wordmark, market hero, ticker headings). The character of the
 * default cut is plenty without pinning the variable axes (which conflicts
 * with explicit weights in next/font).
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata = {
  title: 'Meridian · binary stock outcome markets',
  description:
    'Daily YES/NO markets on MAG7 stock closing prices. $1 USDC binary payout, oracle-settled at 4:05 PM ET. Powered by BitBadges.',
  icons: { icon: '/meridian-logo.png', apple: '/meridian-logo.png' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent' as const, title: 'Meridian' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // viewport-fit=cover lets us paint into the iOS notch/home-indicator area;
  // the bottom tab bar pads itself with env(safe-area-inset-bottom).
  viewportFit: 'cover' as const,
  themeColor: '#0B0908',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${jetbrains.variable}`}>
      <body className="font-sans">
        <WalletProvider>
          <ToastProvider>
            <RealtimeWarmup />
            <OrderFillWatcher />
            <HeroAtmosphere />

            {/* Signature: thin trading-day timeline at the very top — gold
                fill up to "now", open + close ticks. Atmosphere, not chrome. */}
            <TradingDayBar />

            <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-xl">
              <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
                {/* Left cluster — brand + ambient status */}
                <div className="flex items-center gap-4">
                  <BrandLogo />
                  <span className="hidden h-5 w-px bg-border lg:inline-block" />
                  <span className="hidden lg:inline-block">
                    <MarketStatusPill />
                  </span>
                </div>

                {/* Center nav — flexes to fill */}
                <nav className="hidden flex-1 items-center justify-center gap-1 sm:flex">
                  <NavLink href="/markets">Markets</NavLink>
                  <NavLink href="/portfolio">Portfolio</NavLink>
                  <NavLink href="/create">Create</NavLink>
                </nav>

                {/* Right cluster — testnet badge + connect */}
                <div className="ml-auto flex items-center gap-3 sm:ml-0">
                  <span className="hidden items-center gap-1.5 rounded-sm border border-amber/30 bg-amber/5 px-2 py-1 md:inline-flex">
                    <span className="h-1 w-1 rounded-full bg-amber" />
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-amber">
                      Testnet
                    </span>
                  </span>
                  <span className="h-5 w-px bg-border" />
                  <ConnectButton />
                </div>
              </div>
            </header>

            {/* pb leaves room for the fixed mobile tab bar (≈64px + safe area);
                reverts to normal bottom padding ≥ sm where the bar is hidden. */}
            <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pb-24 sm:pt-10">
              {children}
            </main>

            <Footer />
            <MobileNav />
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}

function Footer() {
  // extra bottom padding on mobile so the fixed tab bar doesn't cover the
  // meta row; normal spacing ≥ sm.
  return (
    <footer className="mt-20 border-t border-border bg-gradient-to-b from-bg to-panel pb-20 sm:mt-32 sm:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-10 md:grid-cols-12 sm:gap-12">
          <div className="md:col-span-5">
            <div className="flex items-center gap-3">
              <div className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-border-hi bg-bg shadow-[0_0_24px_-8px_rgba(232,177,74,0.4)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/meridian-logo.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="font-display text-2xl font-semibold tracking-marquee text-ink">
                Meridian
              </span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-dim">
              Daily binary outcome markets on MAG7 stock closing prices.
              On-chain order book, oracle-settled, $1 USDC invariant. No custody, no KYC.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs text-faint">
              <span className="eyebrow">Powered by</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/chains/bitbadges.png"
                alt=""
                width={14}
                height={14}
                className="h-3.5 w-3.5 opacity-70"
              />
              <span className="font-mono uppercase tracking-[0.14em]">BitBadges chain</span>
            </div>
          </div>

          <div className="md:col-span-7 md:flex md:justify-end">
            <FooterColumn
              title="Product"
              links={[
                { label: 'Markets', href: '/markets' },
                { label: 'Portfolio', href: '/portfolio' },
                { label: 'Create', href: '/create' },
              ]}
            />
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
            V0.1 · TESTNET · 2026
          </span>
          <span className="text-[10px] text-faint">
            Not financial advice. Testnet build · no real funds.
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
  inert,
}: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
  inert?: boolean;
}) {
  return (
    <div className="md:col-span-2">
      <h4 className="eyebrow">{title}</h4>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            {inert ? (
              <span className="font-mono text-xs leading-relaxed text-muted">{l.label}</span>
            ) : (
              <a
                href={l.href}
                target={l.external ? '_blank' : undefined}
                rel={l.external ? 'noreferrer noopener' : undefined}
                className="text-xs leading-relaxed text-ink-dim transition-colors hover:text-gold"
              >
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
