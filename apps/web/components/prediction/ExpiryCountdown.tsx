'use client';

import { useEffect, useState } from 'react';

/**
 * Live countdown that ticks more aggressively as the deadline nears
 * (1s when <60s left, 30s when <1h, 60s beyond). Mirrors the FE's
 * ExpiryCountdown so order rows feel "alive". When `startMs` is in the
 * future, renders "Live in Xs" until the window opens.
 */
export function ExpiryCountdown({
  startMs,
  endMs,
  noneLabel = '—',
}: {
  startMs?: number | null;
  endMs?: number | null;
  noneLabel?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  // transferTimes are already in MILLISECONDS (chain convention) — do NOT
  // multiply again. Treat near-max-uint64 as "no expiry".
  const FOREVER = 2_000_000_000_000_000;
  const endVal = endMs && Number(endMs) < FOREVER ? Number(endMs) : 0;
  const startVal = startMs && Number(startMs) < FOREVER ? Number(startMs) : 0;
  const isBeforeStart = startVal > 0 && now < startVal && startVal < endVal;
  const activeDiff = isBeforeStart ? startVal - now : endVal - now;

  useEffect(() => {
    if (!endVal || activeDiff <= 0) return;
    const interval = activeDiff < 60_000 ? 1000 : activeDiff < 3_600_000 ? 30_000 : 60_000;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [endVal, activeDiff]);

  // No expiry / forever
  if (!endVal) return <>{noneLabel}</>;
  if (isBeforeStart) return <>Live in {formatRemaining(activeDiff)}</>;
  if (activeDiff <= 0) return <span className="text-no">Expired</span>;
  return <>{formatRemaining(activeDiff)}</>;
}

function formatRemaining(diffMs: number): string {
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
