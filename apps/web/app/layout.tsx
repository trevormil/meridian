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
  icons: { icon: '/meridian-logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${jetbrains.variable}`}>
      <body className="font-sans">
        <WalletProvider>
          <ToastProvider>
            <RealtimeWarmup />
            <OrderFillWatcher />

            {/* Signature: thin trading-day timeline at the very top — gold
                fill up to "now", open + close ticks. Atmosphere, not chrome. */}
            <TradingDayBar />

            <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-xl">
              <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
                <div className="flex items-center gap-10">
                  <BrandLogo />
                  <nav className="hidden items-center gap-1 sm:flex">
                    <NavLink href="/">Markets</NavLink>
                    <NavLink href="/portfolio">Portfolio</NavLink>
                    <NavLink href="/create">Create</NavLink>
                  </nav>
                </div>
                <ConnectButton />
              </div>
            </header>

            <main className="mx-auto max-w-7xl px-6 pb-24 pt-10">{children}</main>

            <footer className="mx-auto mt-24 max-w-7xl border-t border-border px-6 py-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="eyebrow">Meridian</span>
                  <span className="text-muted text-xs">
                    Binary stock outcome markets · powered by BitBadges chain
                  </span>
                </div>
                <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
                  V0.1 · TESTNET
                </span>
              </div>
            </footer>
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
