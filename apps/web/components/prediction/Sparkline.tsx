'use client';

import { useEffect, useRef, useState } from 'react';
import { loadSparkline } from '@/lib/sparkline-loader';

/**
 * Condensed dual-line price glance for market cards — a miniature of the Trade
 * view chart. Draws YES (green) + NO (red) lines over the last ~10 ten-minute
 * candles, each with a soft area fill, Y pinned to the 0-1 probability domain
 * (so the two lines mirror around 50% and the height reads as absolute
 * probability, comparable card-to-card).
 *
 * Data via loadSparkline(): IntersectionObserver-gated (only fetches when the
 * card scrolls into view) + batched into ONE /sparklines request for the whole
 * page + 15s cached.
 */
interface Props {
  collectionId: string;
  className?: string;
  height?: number;
}

const MAX_POINTS = 10;

export function Sparkline({ collectionId, className, height = 44 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pts, setPts] = useState<number[] | null>(null);
  const [seen, setSeen] = useState(false);

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
      .then((series) => {
        if (!alive) return;
        const clean = series.filter((v) => Number.isFinite(v));
        // Keep the most-recent ≤10 points for a clean, uncrowded glance.
        setPts(clean.slice(-MAX_POINTS));
      })
      .catch(() => alive && setPts([]));
    return () => {
      alive = false;
    };
  }, [seen, collectionId]);

  const W = 100;
  const H = height;
  const pad = 3;

  const yes = pts && pts.length >= 2 ? pts : null;
  const no = yes ? yes.map((v) => 1 - v) : null;

  function toCoords(series: number[]) {
    return series.map((v, i) => {
      const x = pad + (i / (series.length - 1)) * (W - pad * 2);
      const y = pad + (1 - Math.min(1, Math.max(0, v))) * (H - pad * 2);
      return [x, y] as const;
    });
  }
  function linePath(coords: ReadonlyArray<readonly [number, number]>) {
    return coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  }
  function areaPath(coords: ReadonlyArray<readonly [number, number]>) {
    return `${linePath(coords)} L${coords[coords.length - 1][0].toFixed(1)} ${H} L${coords[0][0].toFixed(1)} ${H} Z`;
  }

  const yesC = yes ? toCoords(yes) : null;
  const noC = no ? toCoords(no) : null;
  const gid = `spk-${collectionId}`;

  return (
    <div ref={ref} className={className} style={{ height: H }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        {yesC && noC ? (
          <>
            <defs>
              <linearGradient id={`${gid}-yes`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2FB57E" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#2FB57E" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* faint 50% midline */}
            <line
              x1={pad}
              y1={H / 2}
              x2={W - pad}
              y2={H / 2}
              stroke="rgba(122,112,96,0.18)"
              strokeWidth="1"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
            {/* YES area + line (green) */}
            <path d={areaPath(yesC)} fill={`url(#${gid}-yes)`} stroke="none" />
            <path
              d={linePath(noC)}
              fill="none"
              stroke="#D93826"
              strokeOpacity="0.85"
              strokeWidth="1.3"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={linePath(yesC)}
              fill="none"
              stroke="#2FB57E"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
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
