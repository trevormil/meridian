import { Card } from '@/components/ui/Card';
import { ProbabilityBar } from './ProbabilityBar';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { shortAddr, pct } from '@/lib/format';
import { env } from '@/lib/env';
import type { MarketDto } from '@/lib/aggregator';

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

export function MarketHeader({ market }: Props) {
  const s = statusBadge[market.status];
  return (
    <Card variant="hero" className="overflow-hidden bg-hero-radial">
      <div className="flex items-start gap-5">
        {market.image ? (
          <img
            src={market.image}
            alt=""
            className="h-20 w-20 flex-shrink-0 rounded-xl border border-border object-cover"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        ) : (
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-panel-2 text-3xl font-bold text-muted">
            {(market.name ?? '?').slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}>
              {s.label}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted">Market #{market.collectionId}</span>
          </div>
          <h1 className="text-2xl font-bold leading-tight">{market.name ?? `Market #${market.collectionId}`}</h1>
          {market.description && <p className="mt-1.5 text-sm text-muted">{market.description}</p>}
        </div>

        <div className="hidden flex-shrink-0 text-right md:block">
          <div className="text-[10px] uppercase tracking-wider text-muted">Probability</div>
          <div className="mt-1 flex items-end gap-1.5 font-mono text-2xl font-bold">
            <span className="text-yes">{pct(market.yesPrice)}</span>
            <span className="text-muted text-base">/</span>
            <span className="text-no">{pct(market.noPrice)}</span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <ProbabilityBar yesPrice={market.yesPrice} noPrice={market.noPrice} size="lg" showLabels={false} />
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
          <Stat label="Verifier" value={<code className="font-mono text-ink">{shortAddr(market.verifierAddress)}</code>} />
          <Stat
            label="Total volume"
            value={<CoinDisplay denom={market.depositDenom ?? env.usdcDenom} amount={market.totalDeposited} size="sm" />}
          />
          <Stat label="Backing" value={<span className="font-medium text-ink">{env.usdcSymbol}</span>} />
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted/80">{label}:</span> {value}
    </span>
  );
}
