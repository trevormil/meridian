import './globals.css';
import Link from 'next/link';
import { WalletProvider } from '@/contexts/WalletContext';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { RealtimeWarmup } from '@/components/RealtimeWarmup';
import { ToastProvider } from '@/components/ui/Toasts';
import { OrderFillWatcher } from '@/components/OrderFillWatcher';

export const metadata = {
  title: 'BitBadges Prediction Markets',
  description: 'Bet on binary outcomes. Powered by BitBadges.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <ToastProvider>
            <RealtimeWarmup />
            <OrderFillWatcher />
          <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-2 text-base font-bold">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-white text-xs">
                    ◆
                  </span>
                  <span>
                    BitBadges<span className="text-muted font-normal"> · markets</span>
                  </span>
                </Link>
                <nav className="hidden items-center gap-1 text-sm text-muted sm:flex">
                  <NavLink href="/">Browse</NavLink>
                  <NavLink href="/create">Create</NavLink>
                  <NavLink href="/portfolio">Portfolio</NavLink>
                </nav>
              </div>
              <ConnectButton />
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl border-t border-border px-4 py-6 text-xs text-muted">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Powered by BitBadges chain · USDC-settled</span>
              <span className="font-mono text-[10px] opacity-70">v0.1</span>
            </div>
          </footer>
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 transition-colors hover:bg-panel-2 hover:text-ink"
    >
      {children}
    </Link>
  );
}
