import Link from 'next/link';
import type { MarketDto } from '@/lib/aggregator';
import { Card } from '@/components/ui/Card';
import { ProbabilityBar } from './ProbabilityBar';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { env } from '@/lib/env';
import { parseMarketName, formatCloseDate } from '@/lib/market-name';
import { Sparkline } from './Sparkline';
import { clsx } from 'clsx';

/**
 * Market card — the dominant repeated surface on Meridian's browse view.
 *
 * Layout philosophy: prioritize the THREE pieces of information a trader
 * scans for in this order — (1) which strike question (Fraunces serif, BIG),
 * (2) the YES probability (the horizontal bar dominates middle), (3) volume.
 * Ticker logo sits to the side as a recognition cue, not a focal point.
 *
 * The card is intentionally NOT a rounded pillow — sharp 4px corners +
 * hairline border. On hover it lifts via a soft gold-tinted shadow and the
 * top-left strike text shifts to gold-bright (gives the click an obvious
 * affordance without any explicit "click me" UI).
 */
interface Props {
  market: MarketDto;
}

const statusBadge: Record<MarketDto['status'], { label: string; cls: string }> = {
  active: { label: 'Live', cls: 'border-gold/40 bg-gold/10 text-gold' },
  closed: { label: 'Closed', cls: 'border-border bg-panel-2 text-muted' },
  'resolved-yes': { label: 'YES', cls: 'border-yes/50 bg-yes/15 text-yes-bright' },
  'resolved-no': { label: 'NO', cls: 'border-no/50 bg-no/15 text-no-bright' },
  'resolved-push': { label: 'Push', cls: 'border-amber/40 bg-amber/10 text-amber' },
  unknown: { label: '—', cls: 'border-border bg-panel-2 text-muted' },
};

export function MarketCard({ market }: Props) {
  const s = statusBadge[market.status];
  const parsed = parseMarketName(market.name, market.description);
  const closeLabel = formatCloseDate(parsed?.closeDate);
  const yesPct = (market.yesPrice * 100).toFixed(0);

  return (
    <Link
      href={`/markets/${market.collectionId}`}
      className="group block animate-fade-in-up [animation-fill-mode:both]"
    >
      <Card
        variant="raised"
        className="relative h-full cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-lift"
      >
        {/* Status chip — top-right corner, absolute so it doesn't compete with the strike */}
        <div className="absolute right-5 top-5 z-10">
          <span
            className={clsx(
              'inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]',
              s.cls,
            )}
          >
            {market.status === 'active' && (
              <span className="h-1 w-1 animate-pulse-soft rounded-full bg-gold" />
            )}
            {s.label}
          </span>
        </div>

        {/* Header: ticker logo + question */}
        <div className="mb-5 flex items-start gap-4 pr-16">
          <TickerGlyph ticker={parsed?.ticker} image={market.image} fallback={market.name} />
          <div className="min-w-0 flex-1">
            {parsed ? (
              <div className="flex flex-col">
                <span className="eyebrow">{parsed.ticker}</span>
                <h2 className="mt-1 font-display text-3xl font-semibold leading-none tracking-marquee text-ink transition-colors group-hover:text-gold-bright">
                  ≥ ${parsed.strike}
                </h2>
              </div>
            ) : (
              <h2 className="font-display text-xl font-semibold leading-tight text-ink transition-colors group-hover:text-gold-bright">
                {market.name ?? `Market #${market.collectionId}`}
              </h2>
            )}
            <p className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              <span>#{market.collectionId}</span>
              {closeLabel && (
                <>
                  <span className="text-border-bright">·</span>
                  <span className="text-muted">{closeLabel} close</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Probability bar — the visual anchor */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">YES</span>
            <span className="font-mono text-2xl font-semibold leading-none text-yes-bright">
              {yesPct}<span className="text-base text-yes/60">%</span>
            </span>
          </div>
          <ProbabilityBar yesPrice={market.yesPrice} noPrice={market.noPrice} size="md" />
        </div>

        {/* Condensed dual-line price glance (YES green / NO red), 10m candles */}
        <div className="mt-3">
          <Sparkline collectionId={market.collectionId} height={44} />
        </div>

        {/* Footer: volume + ID */}
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <div className="flex flex-col">
            <span className="eyebrow">Volume</span>
            <CoinDisplay
              denom={market.depositDenom ?? env.usdcDenom}
              amount={market.totalVolume}
              size="sm"
              mono
            />
          </div>
          <span className="font-mono text-[10px] tracking-[0.14em] text-faint transition-colors group-hover:text-gold/80">
            VIEW →
          </span>
        </div>
      </Card>
    </Link>
  );
}

function TickerGlyph({
  ticker,
  image,
  fallback,
}: {
  ticker?: string;
  image: string | null | undefined;
  fallback: string | null | undefined;
}) {
  const src = image ?? (ticker ? `/companies/${ticker}.png` : null);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={ticker ?? ''}
        className="h-12 w-12 flex-shrink-0 rounded-md border border-border bg-bg-deep object-contain p-1.5"
        onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
      />
    );
  }
  return (
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md border border-border bg-bg-deep font-display text-xl font-semibold text-muted">
      {(fallback ?? '?').slice(0, 1).toUpperCase()}
    </div>
  );
}
