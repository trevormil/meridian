'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';

/**
 * Header context indicator — "MARKETS OPEN" / "MARKETS CLOSED" / "PRE-MARKET"
 * with a colored status dot, mirroring the trading-day timeline above.
 * Reads ET wall-clock and updates on the minute. Subtle on purpose — sits
 * next to the brand as ambient context, not a marquee.
 */
function easternMinutes(): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
    timeZone: 'America/New_York',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function isWeekday(): boolean {
  const w = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/New_York',
  }).format(new Date());
  return !['Sat', 'Sun'].includes(w);
}

const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;

type Status = 'pre' | 'open' | 'closed' | 'weekend';

function status(): Status {
  if (!isWeekday()) return 'weekend';
  const m = easternMinutes();
  if (m < OPEN) return 'pre';
  if (m < CLOSE) return 'open';
  return 'closed';
}

const tones: Record<Status, { label: string; dot: string; text: string }> = {
  open: { label: 'Markets open', dot: 'bg-yes shadow-[0_0_8px_rgba(34,197,94,0.7)]', text: 'text-yes-bright' },
  pre: { label: 'Pre-market', dot: 'bg-gold shadow-[0_0_8px_rgba(232,177,74,0.7)]', text: 'text-gold-bright' },
  closed: { label: 'Markets closed', dot: 'bg-muted', text: 'text-muted' },
  weekend: { label: 'Closed · weekend', dot: 'bg-muted', text: 'text-muted' },
};

export function MarketStatusPill() {
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    const tick = () => setS(status());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  if (s === null) return null;
  const t = tones[s];
  return (
    <span className="inline-flex items-center gap-2 rounded-sm border border-border bg-panel-2 px-2.5 py-1">
      <span className={clsx('h-1.5 w-1.5 rounded-full', t.dot, s === 'open' && 'animate-pulse-soft')} />
      <span
        className={clsx(
          'font-mono text-[10px] font-semibold uppercase tracking-[0.16em]',
          t.text,
        )}
      >
        {t.label}
      </span>
    </span>
  );
}
