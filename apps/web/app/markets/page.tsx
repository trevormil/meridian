'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { aggregator, type MarketDto } from '@/lib/aggregator';
import { useRealtime } from '@/lib/useRealtime';
import { ch, realtime } from '@/lib/realtime';
import { MarketCard } from '@/components/prediction/MarketCard';
import { Button } from '@/components/ui/Button';
import { Empty, Skeleton } from '@/components/ui/Empty';
import { clsx } from 'clsx';

type Tab = 'active' | 'yes' | 'no' | 'push' | 'other';

const TAB_LABELS: Record<Tab, string> = {
  active: 'Active',
  yes: 'YES wins',
  no: 'NO wins',
  push: 'Push',
  other: 'Other',
};

const TAB_COLORS: Record<Tab, string> = {
  active: 'border-gold/50 bg-gold/10 text-gold',
  yes: 'border-yes/40 bg-yes/15 text-yes-bright',
  no: 'border-no/40 bg-no/15 text-no-bright',
  push: 'border-amber/40 bg-amber/10 text-amber',
  other: 'border-border bg-panel-2 text-muted',
};

/**
 * Browse page. Tabs split markets by settle status; within each tab, markets
 * are grouped by stock ticker (parsed from the name pattern "TICKER > $STRIKE",
 * which all Meridian markets follow). Markets that don't match the pattern
 * land under "Other" so user-created custom markets aren't lost.
 */
export default function HomePage() {
  // Live-streamed market list. The aggregator pushes the full array whenever
  // any market is added or its price/status/volume changes.
  const markets = useRealtime<MarketDto[]>(ch.markets);
  const [tab, setTab] = useState<Tab>('active');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cold-load fast path: if neither the in-memory cache nor a persisted
  // snapshot has the list yet, fetch it via REST in parallel with the WS
  // connecting. A plain GET (~0.4s) paints far sooner than the WS handshake
  // + snapshot; realtime.seed() is a no-op once the socket delivers.
  useEffect(() => {
    if (markets) return;
    let alive = true;
    aggregator
      .listMarkets()
      .then((m) => alive && realtime.seed(ch.markets, m))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo<Record<Tab, number>>(() => {
    const c: Record<Tab, number> = { active: 0, yes: 0, no: 0, push: 0, other: 0 };
    for (const m of markets ?? []) c[bucketOf(m)]++;
    return c;
  }, [markets]);

  const filtered = useMemo(
    () => (markets ?? []).filter((m) => bucketOf(m) === tab),
    [markets, tab],
  );

  // Group filtered markets by ticker. Each ticker bucket sorts by strike asc.
  const groups = useMemo(() => groupByTicker(filtered), [filtered]);

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await aggregator.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8 sm:gap-6">
          <div>
            <span className="eyebrow">Today · MAG7 closing prices</span>
            <h1 className="text-gold-gradient mt-2 font-display text-4xl font-bold leading-[1.05] tracking-marquee sm:mt-3 sm:text-6xl">
              Markets
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-dim sm:mt-4">
              Daily binary outcome contracts on the seven largest US tech equities. Each pays{' '}
              <span className="font-mono text-gold">$1 USDC</span> for the winning side,{' '}
              <span className="font-mono text-faint">$0</span> for the losing side. Auto-settled
              via oracle at 4:05 PM ET.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" onClick={manualRefresh} loading={refreshing}>
              Refresh
            </Button>
            <Link href="/create">
              <Button size="sm">Create market</Button>
            </Link>
          </div>
        </div>

        {/* tab pills scroll horizontally on mobile rather than wrapping */}
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {(['active', 'yes', 'no', 'push', 'other'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={clsx(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors sm:py-1',
                tab === t
                  ? TAB_COLORS[t]
                  : 'border-border bg-bg/40 text-muted hover:border-border-hi hover:text-ink',
              )}
            >
              {TAB_LABELS[t]} · {counts[t]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-no/40 bg-no/10 p-4 text-sm text-no">{error}</div>
      )}

      {markets === null && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      )}

      {markets && filtered.length === 0 && (
        <Empty
          title={`No ${TAB_LABELS[tab].toLowerCase()} markets`}
          description={
            tab === 'active'
              ? 'Run the morning script (bun run meridian:morning) to create today\'s MAG7 strikes.'
              : 'When markets settle, they\'ll show up here.'
          }
          action={
            tab === 'active' ? (
              <Link href="/create">
                <Button>Create one manually</Button>
              </Link>
            ) : undefined
          }
        />
      )}

      {markets && filtered.length > 0 && (
        <div className="space-y-8">
          {groups.map((g) => (
            <TickerGroup key={g.ticker} ticker={g.ticker} markets={g.markets} />
          ))}
        </div>
      )}
    </div>
  );
}

function TickerGroup({ ticker, markets }: { ticker: string; markets: MarketDto[] }) {
  const logoSrc =
    ticker === 'Other' || ticker === '?'
      ? null
      : `/companies/${ticker}.png`;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3 border-b border-border pb-2">
        {logoSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt={ticker}
            width={24}
            height={24}
            className="h-6 w-6 rounded-full border border-border bg-bg object-contain"
          />
        )}
        <h2 className="text-lg font-semibold tracking-tight">{ticker}</h2>
        <span className="text-xs text-muted">
          {markets.length} {markets.length === 1 ? 'market' : 'markets'}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {markets.map((m) => (
          <MarketCard key={m.collectionId} market={m} />
        ))}
      </div>
    </div>
  );
}

/**
 * Parse the leading TICKER from a Meridian market name. Returns 'Other' for
 * anything that doesn't match the "TICKER > $..." pattern.
 */
function parseTicker(name: string | null | undefined): string {
  if (!name) return 'Other';
  // Strip a leading [E2E] / [TEST] / etc. label if present (defensive — these
  // should already be filtered out by the aggregator's bootstrap).
  const stripped = name.replace(/^\[[^\]]+]\s*/, '');
  const m = stripped.match(/^([A-Z]{1,6})\s*[>≥]\s*\$/);
  return m ? m[1] : 'Other';
}

/**
 * Map a market's chain status to one of our 5 UI buckets. Anything not
 * resolved or active (legacy states, unknown) lands under "Other".
 */
function bucketOf(m: MarketDto): Tab {
  switch (m.status) {
    case 'active':
      return 'active';
    case 'resolved-yes':
      return 'yes';
    case 'resolved-no':
      return 'no';
    case 'resolved-push':
      return 'push';
    default:
      return 'other';
  }
}

interface Group {
  ticker: string;
  markets: MarketDto[];
}

const MAG7_ORDER = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];

function groupByTicker(markets: MarketDto[]): Group[] {
  const buckets = new Map<string, MarketDto[]>();
  for (const m of markets) {
    const t = parseTicker(m.name);
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t)!.push(m);
  }
  // Sort within each ticker by strike (parsed from name) ascending so the
  // ladder reads naturally.
  for (const arr of buckets.values()) {
    arr.sort((a, b) => parseStrike(a.name) - parseStrike(b.name));
  }
  // MAG7 tickers in canonical order first, then any others alphabetical,
  // then "Other" last.
  const tickers = [...buckets.keys()].sort((a, b) => {
    const ai = MAG7_ORDER.indexOf(a);
    const bi = MAG7_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });
  return tickers.map((t) => ({ ticker: t, markets: buckets.get(t)! }));
}

function parseStrike(name: string | null | undefined): number {
  if (!name) return Number.POSITIVE_INFINITY;
  const m = name.match(/\$([0-9]+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}
