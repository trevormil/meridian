'use client';

import { useEffect, useRef, useState } from 'react';
import { loadSparkline } from '@/lib/sparkline-loader';

/**
 * Tiny YES-price trend glance for market cards. Draws a normalized SVG
 * polyline + soft area fill from the 10m candle series. Trend-colored:
 * closes-up → green, closes-down → red, flat → muted gold.
 *
 * Data comes from loadSparkline(), a DataLoader that (a) lazy-fetches only
 * once the card scrolls into view, (b) coalesces every visible card's ask
 * into ONE batched /sparklines request, and (c) caches for 15s. A 45-card
 * page therefore makes a single round-trip, not 45.
 */
interface Props {
  collectionId: string;
  className?: string;
  height?: number;
}

export function Sparkline({ collectionId, className, height = 32 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pts, setPts] = useState<number[] | null>(null);
  const [seen, setSeen] = useState(false);

  // Defer the fetch until visible.
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen) return;
    let alive = true;
    loadSparkline(collectionId)
      .then((series) => alive && setPts(series.filter((v) => Number.isFinite(v))))
      .catch(() => alive && setPts([]));
    return () => {
      alive = false;
    };
  }, [seen, collectionId]);

  const W = 100; // viewBox width; SVG scales to container via preserveAspectRatio=none
  const H = height;
  const pad = 2;

  // Build the path. Y axis is the 0..1 price domain, pinned (not auto-scaled)
  // so a card's line height reads as absolute probability, comparable card to
  // card. Flat 50/50 history sits dead center.
  const data = pts && pts.length >= 2 ? pts : null;
  const trend = data ? data[data.length - 1] - data[0] : 0;
  const stroke = !data
    ? 'rgba(122,112,96,0.35)'
    : trend > 0.001
      ? '#2FB57E'
      : trend < -0.001
        ? '#D93826'
        : 'rgba(232,177,74,0.55)';

  const coords =
    data?.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (W - pad * 2);
      const y = pad + (1 - Math.min(1, Math.max(0, v))) * (H - pad * 2);
      return [x, y] as const;
    }) ?? null;

  const linePath = coords ? coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') : '';
  const areaPath = coords
    ? `${linePath} L${coords[coords.length - 1][0].toFixed(1)} ${H} L${coords[0][0].toFixed(1)} ${H} Z`
    : '';
  const gradId = `spark-${collectionId}`;

  return (
    <div ref={ref} className={className} style={{ height: H }}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="overflow-visible"
        aria-hidden
      >
        {coords ? (
          <>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
            <path
              d={linePath}
              fill="none"
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          // placeholder: faint flat baseline at 50%
          <line
            x1={pad}
            y1={H / 2}
            x2={W - pad}
            y2={H / 2}
            stroke="rgba(122,112,96,0.25)"
            strokeWidth="1"
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}
