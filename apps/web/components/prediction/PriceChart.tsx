'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  CrosshairMode,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { aggregator, type PricePoint } from '@/lib/aggregator';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import { clsx } from 'clsx';

/**
 * Price-history chart. YES + NO complementary lines (sum to 100%), pinned
 * to a 0–100% Y-axis. YES line gets a subtle green area fill underneath for
 * visual weight; NO is a clean line. Dashed grid, gold crosshair, smooth
 * bezier curves.
 */
interface Props {
  collectionId: string;
}

const TIMEFRAMES = ['1m', '10m', '1h', '1d'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

export function PriceChart({ collectionId }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const yesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const noRef = useRef<ISeriesApi<'Line'> | null>(null);
  const refLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  // Only auto-fit the view on a structural change (market/timeframe), not on
  // every realtime candle — otherwise a new tick would yank back the user's zoom.
  const fitKeyRef = useRef<string>('');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [empty, setEmpty] = useState(true);
  const [hover, setHover] = useState<{ yes: number; no: number } | null>(null);

  // Realtime: the aggregator publishes on `candle:{id}` every block-tick
  // heartbeat (~1.5s) AND on every actual trade. We re-fetch the series
  // whenever a push lands so the chart visibly ticks without polling.
  const candleSig = useRealtime(ch.candle(collectionId)) as unknown;

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#15110E' },
        textColor: '#7A7060',
        fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(42, 35, 29, 0.5)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(42, 35, 29, 0.5)', style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderColor: 'rgba(42, 35, 29, 0.6)',
        scaleMargins: { top: 0.08, bottom: 0.08 },
        // Pin to a fixed 0–100% scale so tiny moves don't autoscale the line
        // into chaos. The autoscaleInfoProvider on each series enforces this.
      },
      timeScale: {
        borderColor: 'rgba(42, 35, 29, 0.6)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: 'rgba(232, 177, 74, 0.5)',
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: '#8A6A28',
        },
        horzLine: {
          color: 'rgba(232, 177, 74, 0.5)',
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: '#8A6A28',
        },
      },
      // Zoom + pan, TradingView-style: wheel/pinch zooms, drag pans, drag on
      // the time axis scales it. (Both were disabled before.)
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const pinRange = () => ({ priceRange: { minValue: 0, maxValue: 1 } });

    // 50% reference line behind everything else.
    refLineRef.current = chart.addLineSeries({
      color: 'rgba(122, 112, 96, 0.35)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: pinRange,
    });

    // YES line — green curve.
    yesRef.current = chart.addLineSeries({
      color: '#22C55E',
      lineWidth: 2,
      lineType: LineType.Curved,
      lastValueVisible: true,
      priceFormat: { type: 'percent', precision: 1, minMove: 0.001 },
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#0B0908',
      crosshairMarkerBackgroundColor: '#22C55E',
      autoscaleInfoProvider: pinRange,
    });

    // NO line — red curve.
    noRef.current = chart.addLineSeries({
      color: '#EF4444',
      lineWidth: 2,
      lineType: LineType.Curved,
      lastValueVisible: true,
      priceFormat: { type: 'percent', precision: 1, minMove: 0.001 },
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#0B0908',
      crosshairMarkerBackgroundColor: '#EF4444',
      autoscaleInfoProvider: pinRange,
    });

    chart.subscribeCrosshairMove((param) => {
      const yd = param.seriesData.get(yesRef.current!) as { value?: number } | undefined;
      const nd = param.seriesData.get(noRef.current!) as { value?: number } | undefined;
      if (yd && nd && typeof yd.value === 'number' && typeof nd.value === 'number') {
        setHover({ yes: yd.value, no: nd.value });
      } else {
        setHover(null);
      }
    });

    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Re-fires on each candle WS push (via candleSig). Backend is the
    // authoritative source: every market is seeded with a 50/50 candle at
    // creation in `seedInitialCandles`, and the heartbeat poller writes the
    // current bucket every block tick. So the FE has zero series fabrication
    // — we just render the raw series in order. No anchor prepend, no flat
    // tail. If the line ends mid-chart, that's because that's where the data
    // ends; that's the truth.
    void candleSig;
    aggregator
      .getPrices(collectionId, timeframe)
      .then((p) => {
        const sort = (pts: PricePoint[]) =>
          pts
            .map((pp) => ({ time: Math.floor(pp.time / 1000) as Time, value: pp.value }))
            .sort((a, b) => Number(a.time) - Number(b.time));
        const yesSeries = sort(p.yes);
        const noSeries = sort(p.no);

        yesRef.current?.setData(yesSeries);
        noRef.current?.setData(noSeries);
        // 50% reference line spans the data window.
        if (yesSeries.length > 0) {
          refLineRef.current?.setData([
            { time: yesSeries[0].time, value: 0.5 },
            { time: yesSeries[yesSeries.length - 1].time, value: 0.5 },
          ]);
        } else {
          refLineRef.current?.setData([]);
        }
        // Fit only when the market or timeframe changed; preserve the user's
        // manual zoom/pan across realtime candle updates.
        const fitKey = `${collectionId}|${timeframe}`;
        if (fitKeyRef.current !== fitKey) {
          chartRef.current?.timeScale().fitContent();
          fitKeyRef.current = fitKey;
        }
        setEmpty(yesSeries.length === 0);
      })
      .catch(() => setEmpty(true));
  }, [collectionId, timeframe, candleSig]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <CardTitle>Price history</CardTitle>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-sm bg-yes" />
              <span className="text-yes-bright">YES</span>
              <span className="text-ink">
                {hover ? `${(hover.yes * 100).toFixed(1)}%` : <span className="text-faint">—</span>}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-sm bg-no" />
              <span className="text-no-bright">NO</span>
              <span className="text-ink">
                {hover ? `${(hover.no * 100).toFixed(1)}%` : <span className="text-faint">—</span>}
              </span>
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={clsx(
                'rounded-sm border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors',
                timeframe === tf
                  ? 'border-gold/50 bg-gold/10 text-gold'
                  : 'border-border bg-bg-deep text-muted hover:border-border-hi hover:text-ink',
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </CardHeader>
      <div ref={ref} className="h-72 w-full overflow-hidden rounded border border-border" />
      {empty && (
        <p className="mt-3 text-center text-[11px] text-faint">
          Candles still seeding — backend writes the first 50/50 bucket on market index.
        </p>
      )}
    </Card>
  );
}
