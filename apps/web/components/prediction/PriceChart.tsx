'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts';
import { aggregator, type PricePoint } from '@/lib/aggregator';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

interface Props {
  collectionId: string;
}

export function PriceChart({ collectionId }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const yesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const noRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [timeframe, setTimeframe] = useState<'10m' | '1h' | '1d'>('1h');
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#15151a' }, textColor: '#8a8a96' },
      grid: { vertLines: { color: '#26262d' }, horzLines: { color: '#26262d' } },
      rightPriceScale: { borderColor: '#26262d' },
      timeScale: { borderColor: '#26262d' },
    });
    yesRef.current = chartRef.current.addLineSeries({ color: '#22c55e', lineWidth: 2 });
    noRef.current = chartRef.current.addLineSeries({ color: '#ef4444', lineWidth: 2 });
    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    aggregator
      .getPrices(collectionId, timeframe)
      .then((p) => {
        const map = (pts: PricePoint[]) => pts.map((pp) => ({ time: Math.floor(pp.time / 1000) as Time, value: pp.value }));
        const yesData = map(p.yes);
        const noData = map(p.no);
        // Every prediction market starts at the neutral 50/50 prior. We anchor
        // the chart there so the line visually begins at 0.5 even after the
        // first fill — that fill becomes a clear jump away from neutral rather
        // than the chart's mysterious starting point.
        const spanSec = timeframe === '10m' ? 60 * 60 : timeframe === '1h' ? 6 * 60 * 60 : 24 * 60 * 60;
        const nowSec = Math.floor(Date.now() / 1000);
        const anchorTime = (yesData.length > 0
          ? Math.min(Number(yesData[0].time) - 1, nowSec - spanSec)
          : nowSec - spanSec) as Time;
        const yesSeries = [{ time: anchorTime, value: 0.5 }, ...yesData];
        const noSeries = [{ time: anchorTime, value: 0.5 }, ...noData];
        // When there are no real fills we also extend the flat line to `now`
        // so the chart shows a continuous 50/50 baseline up to the present.
        if (yesData.length === 0) {
          const now = nowSec as Time;
          yesSeries.push({ time: now, value: 0.5 });
          noSeries.push({ time: now, value: 0.5 });
        }
        yesRef.current?.setData(yesSeries);
        noRef.current?.setData(noSeries);
        setEmpty(yesData.length === 0);
      })
      .catch(() => setEmpty(true));
  }, [collectionId, timeframe]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price history</CardTitle>
        <div className="flex gap-1">
          {(['10m', '1h', '1d'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded px-2 py-1 text-xs ${timeframe === tf ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
            >
              {tf}
            </button>
          ))}
        </div>
      </CardHeader>
      <div ref={ref} className="h-64 w-full" />
      {empty && (
        <p className="mt-2 text-center text-xs text-muted">
          No trades yet — chart anchored at 50/50. The first fill will replace this stub.
        </p>
      )}
    </Card>
  );
}
