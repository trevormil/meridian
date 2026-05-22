'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * Meridian wordmark. The logo glyph (warm gradient M on charcoal) pairs
 * with the wordmark in Fraunces — the serif's high contrast echoes the
 * gradient sweep in the mark. "powered by BitBadges" sits beneath in
 * tiny eyebrow caps so it never competes with the marquee.
 */
export function BrandLogo() {
  const [errored, setErrored] = useState(false);
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-hi bg-bg shadow-[0_0_24px_-8px_rgba(232,177,74,0.4)] transition-all group-hover:border-gold/50 group-hover:shadow-[0_0_28px_-6px_rgba(232,177,74,0.55)]">
        {errored ? (
          <span className="font-display text-base font-semibold text-gold">M</span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/meridian-logo.png"
            alt="Meridian"
            width={32}
            height={32}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        )}
      </span>
      <span className="text-gold-gradient font-display text-xl font-bold leading-none tracking-marquee group-hover:brightness-110">
        Meridian
      </span>
    </Link>
  );
}
