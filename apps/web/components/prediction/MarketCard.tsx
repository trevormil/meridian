import Link from 'next/link';
import type { MarketDto } from '@/lib/aggregator';
import { Card } from '@/components/ui/Card';
import { ProbabilityBar } from './ProbabilityBar';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { env } from '@/lib/env';

interface Props {
  market: MarketDto;
}

const statusBadge: Record<MarketDto['status'], { label: string; cls: string }> = {
  active: { label: 'Live', cls: 'bg-yes/15 text-yes border-yes/40' },
  closed: { label: 'Closed', cls: 'bg-border text-muted border-border' },
  'resolved-yes': { label: 'YES Won', cls: 'bg-yes/20 text-yes border-yes/50' },
  'resolved-no': { label: 'NO Won', cls: 'bg-no/20 text-no border-no/50' },
  'resolved-push': { label: 'Push', cls: 'bg-accent/20 text-accent border-accent/40' },
  unknown: { label: '—', cls: 'bg-border text-muted border-border' },
};

export function MarketCard({ market }: Props) {
  const s = statusBadge[market.status];
  return (
    <Link href={`/markets/${market.collectionId}`} className="group block animate-fade-in">
      <Card variant="raised" className="cursor-pointer transition-all duration-200 hover:border-border-hi hover:shadow-lift">
        <div className="mb-4 flex items-start gap-3">
          {market.image ? (
            <img
              src={market.image}
              alt=""
              className="h-12 w-12 flex-shrink-0 rounded-lg border border-border object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
          ) : (
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-panel-2 text-lg font-bold text-muted">
              {(market.name ?? '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-base font-semibold leading-tight text-ink group-hover:text-accent">
              {market.name ?? `Market #${market.collectionId}`}
            </h2>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">#{market.collectionId}</p>
          </div>
          <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}>
            {s.label}
          </span>
        </div>

        {market.description && (
          <p className="mb-4 line-clamp-2 text-sm text-muted">{market.description}</p>
        )}

        <ProbabilityBar yesPrice={market.yesPrice} noPrice={market.noPrice} size="md" />

        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
          <span className="text-muted">Volume</span>
          <CoinDisplay denom={market.depositDenom ?? env.usdcDenom} amount={market.totalDeposited} size="sm" />
        </div>
      </Card>
    </Link>
  );
}
