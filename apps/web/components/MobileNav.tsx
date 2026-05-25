'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

/**
 * Mobile bottom tab bar. The desktop header nav is `hidden sm:flex`, so on
 * phones (the in-Keplr-browser target) navigation lives here — thumb-reachable,
 * app-like, fixed to the bottom with an iOS safe-area inset. Hidden ≥ sm.
 *
 * Three destinations mirror the header nav. Inline stroke SVGs (no icon dep,
 * no emoji per house style); active tab glows gold with a top hairline.
 */
const TABS = [
  { href: '/markets', label: 'Markets', icon: ChartIcon },
  { href: '/portfolio', label: 'Portfolio', icon: WalletIcon },
  { href: '/create', label: 'Create', icon: PlusIcon },
  { href: '/explorer', label: 'Explorer', icon: BlocksIcon },
  { href: '/how-it-works', label: 'Guide', icon: HelpIcon },
];

export function MobileNav() {
  const path = usePathname();
  return (
    <nav
      className="pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg/95 backdrop-blur-xl sm:hidden"
      aria-label="Primary"
    >
      <div className="flex items-stretch">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'group relative flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors',
                active ? 'text-gold-bright' : 'text-muted active:text-ink',
              )}
            >
              {/* active top hairline */}
              <span
                className={clsx(
                  'pointer-events-none absolute inset-x-6 top-0 h-px transition-opacity',
                  active ? 'bg-gold opacity-100' : 'opacity-0',
                )}
              />
              <Icon className="h-5 w-5" />
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em]">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l3-4 3 2 4-6" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function BlocksIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <rect x="3" y="10.5" width="18" height="5" rx="1" />
      <rect x="3" y="17" width="11" height="3" rx="1" />
    </svg>
  );
}

function HelpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.5 2.5 0 0 1 4.5 1.5c0 1.7-2.5 2-2.5 3.3" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
