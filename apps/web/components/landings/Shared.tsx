'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Shared atoms for the 10 landing variants. Keeps the BitBadges attribution
 * + browse CTA + countdown logic DRY so each landing can focus on its hero
 * choice without repeating chrome.
 */

export function PoweredBy({ tone = 'subtle' }: { tone?: 'subtle' | 'card' | 'block' }) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/chains/bitbadges.png"
        alt=""
        width={12}
        height={12}
        className="h-3 w-3 shrink-0 opacity-70"
      />
      <span className="font-mono uppercase tracking-[0.16em]">Powered by BitBadges</span>
    </>
  );
  if (tone === 'card') {
    return (
      <a
        href="https://bitbadges.io"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded border border-border bg-panel-2 px-2.5 py-1 text-[10px] text-faint transition-colors hover:border-gold/40 hover:text-gold"
      >
        {inner}
      </a>
    );
  }
  if (tone === 'block') {
    return (
      <a
        href="https://bitbadges.io"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded border-l-2 border-l-gold border-y border-r border-border bg-panel-2 px-4 py-2.5 text-xs text-ink-dim transition-colors hover:text-ink"
      >
        {inner}
      </a>
    );
  }
  return (
    <a
      href="https://bitbadges.io"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-[10px] text-faint transition-colors hover:text-gold"
    >
      {inner}
    </a>
  );
}

export function BrowseCta({
  label = 'Browse markets',
  variant = 'primary',
}: {
  label?: string;
  variant?: 'primary' | 'ghost' | 'arrow';
}) {
  if (variant === 'arrow') {
    return (
      <Link
        href="/markets"
        className="group inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-gold transition-colors hover:text-gold-bright"
      >
        {label} <span className="transition-transform group-hover:translate-x-1">→</span>
      </Link>
    );
  }
  if (variant === 'ghost') {
    return (
      <Link
        href="/markets"
        className="inline-flex items-center gap-2 rounded border border-gold/50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold transition-all hover:border-gold hover:bg-gold/10"
      >
        {label}
      </Link>
    );
  }
  return (
    <Link
      href="/markets"
      className="inline-flex items-center gap-2 rounded bg-gold-gradient px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-bg shadow-[0_4px_28px_-6px_rgba(232,177,74,0.55)] transition-all hover:brightness-110 active:translate-y-px"
    >
      {label}
    </Link>
  );
}

/** Live ET countdown until 4:00 PM close — used by several landings. */
export function useCloseCountdown(): { label: string; phase: 'pre' | 'open' | 'closed' } {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return { label: '—:—:—', phase: 'pre' };

  // Anchor today's 16:00 ET as a wall-clock target; compute via parts.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(now)).map((p) => [p.type, p.value]),
  );
  const h = Number(parts.hour);
  const m = Number(parts.minute);
  const s = Number(parts.second);
  const nowMin = h * 60 + m + s / 60;
  const closeMin = 16 * 60;
  const openMin = 9 * 60 + 30;
  if (nowMin < openMin) return { label: 'Pre-market', phase: 'pre' };
  if (nowMin >= closeMin) return { label: 'Closed', phase: 'closed' };
  const remaining = closeMin * 60 - (h * 3600 + m * 60 + s);
  const hh = String(Math.floor(remaining / 3600)).padStart(2, '0');
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return { label: `${hh}:${mm}:${ss}`, phase: 'open' };
}
