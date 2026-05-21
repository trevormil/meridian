'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

/**
 * Header nav link. Uppercase eyebrow + active-route indicator (a 1px gold
 * underline directly beneath the text — tighter than a pill, more
 * Bloomberg-terminal in feel).
 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || (href !== '/' && path?.startsWith(href));
  return (
    <Link
      href={href}
      className={clsx(
        'group relative px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors',
        active ? 'text-gold' : 'text-muted hover:text-ink',
      )}
    >
      {children}
      <span
        className={clsx(
          'pointer-events-none absolute inset-x-3 -bottom-px h-px origin-center transition-all',
          active ? 'scale-x-100 bg-gold' : 'scale-x-0 bg-gold/60 group-hover:scale-x-100',
        )}
      />
    </Link>
  );
}
