'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * Meridian header brand.
 *
 * Renders a local `/meridian-logo.png` if present, otherwise falls back to a
 * gradient "M" monogram (which still reads as on-brand). Why local-only:
 * Midjourney's CDN (`cdn.midjourney.com`) is fronted by Cloudflare and
 * returns a 403 bot-challenge to every non-browser fetch, so we can't cache
 * the image from a build step or curl — the user has to save it manually
 * from their browser to `apps/web/public/meridian-logo.png`.
 *
 * Until that drop happens, the monogram is the brand mark.
 */
export function BrandLogo() {
  const [errored, setErrored] = useState(false);
  return (
    <Link href="/" className="flex items-center gap-2 text-base font-bold">
      <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-accent to-blue-600 text-sm font-bold text-white">
        {errored ? (
          <span>M</span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/meridian-logo.png"
            alt="Meridian"
            width={28}
            height={28}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        )}
      </span>
      <span>
        Meridian<span className="text-muted font-normal"> · powered by BitBadges</span>
      </span>
    </Link>
  );
}
