'use client';

import { useEffect, useState } from 'react';

/**
 * Signature decorative element — a thin gold line at the very top of the
 * page showing where we are in the US trading day. Filled gold up to the
 * "now" marker; thin gold-deep beyond. Tick marks at 9:30 AM open + 4:00 PM
 * close. Pre-market and after-hours dim out the bar.
 *
 * The point isn't a clock — there's a separate UI for the settle countdown.
 * This is brand atmosphere: a subliminal "you're inside the trading day"
 * cue that ties the whole product to its temporal anchor.
 */
const OPEN_MIN = 9 * 60 + 30;   // 09:30 ET — market open
const CLOSE_MIN = 16 * 60;      // 16:00 ET — market close
const DAY_START = 8 * 60;       // 08:00 ET — left edge of the bar (morning script runs)
const DAY_END = 16 * 60 + 30;   // 16:30 ET — right edge (post-settle)

function easternMinutes(): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone: 'America/New_York',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function TradingDayBar() {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setMinutes(easternMinutes());
    tick();
    const id = setInterval(tick, 30_000); // 30s — visible motion but cheap
    return () => clearInterval(id);
  }, []);

  if (minutes === null) return <div className="h-px w-full bg-border" aria-hidden />;

  const clamped = Math.max(DAY_START, Math.min(DAY_END, minutes));
  const pctOfDay = ((clamped - DAY_START) / (DAY_END - DAY_START)) * 100;
  const openPct = ((OPEN_MIN - DAY_START) / (DAY_END - DAY_START)) * 100;
  const closePct = ((CLOSE_MIN - DAY_START) / (DAY_END - DAY_START)) * 100;
  const preMarket = minutes < OPEN_MIN;
  const afterHours = minutes >= CLOSE_MIN;

  return (
    <div
      className="relative h-[2px] w-full overflow-visible bg-border"
      aria-label={`Trading day progress — ${pctOfDay.toFixed(0)}% complete`}
    >
      {/* Filled portion: gold-deep base + bright gold above the now-line */}
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-gold-deep/40 via-gold/80 to-gold"
        style={{ width: `${pctOfDay}%` }}
      />
      {/* Now indicator — small gold dot with halo */}
      <div
        className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_8px_2px_rgba(232,177,74,0.6)]"
        style={{ left: `${pctOfDay}%` }}
      />
      {/* Open + close ticks */}
      <Tick pct={openPct} label="9:30 OPEN" active={!preMarket} />
      <Tick pct={closePct} label="4:00 CLOSE" active={afterHours} />
    </div>
  );
}

function Tick({ pct, label, active }: { pct: number; label: string; active: boolean }) {
  return (
    <div
      className="group absolute top-1/2 h-2 w-px -translate-y-1/2 cursor-default bg-border-bright"
      style={{ left: `${pct}%` }}
    >
      <span
        className={`pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] tracking-[0.14em] transition-colors ${
          active ? 'text-gold/80' : 'text-muted'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
