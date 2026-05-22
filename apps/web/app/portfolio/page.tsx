'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/contexts/WalletContext';
import { getBankBalances, getUserBalance, type Coin } from '@/lib/chain/lcd';
import { aggregator, type IntentDto, type MarketDto } from '@/lib/aggregator';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import { useRefreshOnTx } from '@/lib/tx-bus';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { Empty, Skeleton } from '@/components/ui/Empty';
import { Button } from '@/components/ui/Button';
import { sumYesNo } from '@/lib/prediction-market/balances';
import { env } from '@/lib/env';
import { FaucetCard } from '@/components/wallet/FaucetCard';
import { UsdcSymbol } from '@/components/ui/UsdcSymbol';

interface Position {
  market: MarketDto;
  yes: bigint;
  no: bigint;
}

/**
 * One row in the portfolio "Open orders" list. Translates the raw intent
 * (pay/receive denoms + amounts) into the user-facing exchange grammar:
 *
 *   BUY  10 YES @ 80¢   ← user spent 8.00 USDC to receive 10 YES tokens
 *   SELL  5 NO  @ 55¢   ← user gave 5 NO tokens to receive 2.75 USDC
 *
 * Never displays the raw `8000000` base units or the long `ibc/F08...` denom
 * string — those leak the chain's encoding and aren't readable.
 */
function OpenOrderRow({ intent: i }: { intent: IntentDto }) {
  const payIsTok = (i.payDenom ?? '').startsWith('badgeslp:');
  const tokenDenom = payIsTok ? i.payDenom : i.receiveDenom;
  const tokenAmtRaw = BigInt((payIsTok ? i.payAmount : i.receiveAmount) ?? '0');
  const coinAmtRaw = BigInt((payIsTok ? i.receiveAmount : i.payAmount) ?? '0');
  const side: 'yes' | 'no' | 'unknown' = tokenDenom?.endsWith(':uyes')
    ? 'yes'
    : tokenDenom?.endsWith(':uno')
      ? 'no'
      : 'unknown';
  const tokens = formatBaseUnits(tokenAmtRaw, env.usdcDecimals);
  const usdc = formatBaseUnits(coinAmtRaw, env.usdcDecimals);
  // Implied price per token in cents (rounded). incoming approval = user buying tokens,
  // outgoing = user selling tokens — semantics differ but price-per-token math is the same.
  const pricePct =
    tokenAmtRaw > 0n
      ? ((Number(coinAmtRaw) / Number(tokenAmtRaw)) * 100).toFixed(0)
      : '—';
  const direction = i.approvalLevel === 'incoming' ? 'BUY' : 'SELL';
  return (
    <li>
      <Link
        href={`/markets/${i.collectionId}`}
        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg/40 px-3 py-2 text-sm transition-colors hover:border-border-hi"
      >
        <span className="flex items-center gap-2">
          <span
            className={
              direction === 'BUY'
                ? 'rounded border border-yes/40 bg-yes/10 px-1.5 py-0.5 text-[10px] font-semibold text-yes'
                : 'rounded border border-no/40 bg-no/10 px-1.5 py-0.5 text-[10px] font-semibold text-no'
            }
          >
            {direction}
          </span>
          <span className="font-mono text-ink">{tokens}</span>
          <span
            className={
              side === 'yes'
                ? 'rounded border border-yes/40 bg-yes/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yes'
                : side === 'no'
                  ? 'rounded border border-no/40 bg-no/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-no'
                  : 'text-muted'
            }
          >
            {side === 'unknown' ? '—' : side.toUpperCase()}
          </span>
          <span className="text-muted">@</span>
          <span className="font-mono text-ink">{pricePct}¢</span>
          <span className="text-muted">·</span>
          <span className="font-mono text-muted">{usdc}</span>
          <UsdcSymbol size="xs" className="text-muted" />
        </span>
        <span
          className={`text-xs ${i.used ? 'text-muted' : i.isExpired ? 'text-no' : 'text-yes'}`}
        >
          {i.used ? 'Filled' : i.isExpired ? 'Expired' : i.isPending ? 'Pending' : 'Active'}
        </span>
      </Link>
    </li>
  );
}

/**
 * Position row — one entry per market the user holds tokens on. Three-column
 * grid:
 *   LEFT — ticker logo + ticker eyebrow + strike (Fraunces serif)
 *   MID  — current YES probability + holding chips (YES/NO with mark values)
 *   RIGHT — total mark-to-market value at current market quotes
 *
 * Skips the zero side when only one of YES/NO is held (no more "1 YES vs 0 NO"
 * noise). Always reads the latest yesPrice off the realtime market so the
 * portfolio is mark-to-market live as quotes move.
 */
function PositionRow({ position }: { position: Position }) {
  const m = position.market;
  const parsed = parseMarketRow(m.name);
  const totalValue = (Number(position.yes) * m.yesPrice + Number(position.no) * m.noPrice) /
    10 ** env.usdcDecimals;
  const yesTok = formatBaseUnits(position.yes, env.usdcDecimals);
  const noTok = formatBaseUnits(position.no, env.usdcDecimals);

  return (
    <li>
      <Link
        href={`/markets/${m.collectionId}`}
        className="group grid h-14 grid-cols-[auto_1fr_auto_auto] items-center gap-6 px-1 transition-colors hover:bg-panel-2/60"
      >
        <TickerGlyph ticker={parsed?.ticker} image={m.image} fallback={m.name} />
        <span className="truncate font-display text-base font-semibold leading-none tracking-marquee text-ink transition-colors group-hover:text-gold-bright">
          {parsed ? (
            <>
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted">{parsed.ticker}</span>{' '}
              <span>≥ ${parsed.strike}</span>
            </>
          ) : (
            m.name ?? `Market #${m.collectionId}`
          )}
        </span>
        <span className="whitespace-nowrap font-mono text-xs">
          {position.yes > 0n && <span className="text-yes">{yesTok} YES</span>}
          {position.yes > 0n && position.no > 0n && <span className="text-faint"> · </span>}
          {position.no > 0n && <span className="text-no">{noTok} NO</span>}
        </span>
        <span className="whitespace-nowrap text-right font-mono text-base font-semibold text-gold-bright">
          {totalValue.toFixed(2)}{' '}
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{env.usdcSymbol}</span>
        </span>
      </Link>
    </li>
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
        className="h-10 w-10 shrink-0 rounded-md border border-border bg-bg-deep object-contain p-1.5"
        onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-bg-deep font-display text-base font-semibold text-muted">
      {(fallback ?? '?').slice(0, 1).toUpperCase()}
    </div>
  );
}

function parseMarketRow(name: string | null | undefined): { ticker: string; strike: string } | null {
  if (!name) return null;
  const stripped = name.replace(/^\[[^\]]+]\s*/, '');
  const m = stripped.match(/^([A-Z]{1,6})\s*[>≥]\s*\$([0-9,]+)/);
  return m ? { ticker: m[1], strike: m[2] } : null;
}

function formatBaseUnits(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0';
  const div = BigInt(10) ** BigInt(decimals);
  const whole = raw / div;
  const frac = raw % div;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 2);
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export default function PortfolioPage() {
  const { address, connect } = useWallet();
  const [positions, setPositions] = useState<Position[]>([]);
  const [usdc, setUsdc] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);

  // Realtime: any change to ANY of this user's intents on any market is pushed
  // to us. Positions + bank balance are still chain-side and refetched on tx
  // confirm via the tx-bus.
  const intents = useRealtime<IntentDto[]>(address ? ch.intentsOwner(address) : null) ?? [];

  // Realtime: any market metadata change re-fires this and we recompute positions.
  const markets = useRealtime<MarketDto[]>(ch.markets) ?? null;

  // Refresh bank + position queries on mount AND on every tx confirmation
  // (deposit, fill, redeem, faucet, etc.) so the user never has to manually
  // reload the page to see post-tx balances.
  useRefreshOnTx(() => {
    if (!address || markets === null) return;
    let cancel = false;
    setLoading(true);
    (async () => {
      // YES/NO live in tokenization (x/tokenization UserBalanceStore), NOT
      // cosmos-bank — so we have to query each known market's balance store
      // individually. Bank is only used for the USDC backing denom.
      const bank = await getBankBalances(address);
      if (cancel) return;
      const stores = await Promise.all(
        markets.map(async (m) => ({ market: m, store: await getUserBalance(m.collectionId, address) })),
      );
      if (cancel) return;
      const pos: Position[] = [];
      for (const { market, store } of stores) {
        const { yes, no } = sumYesNo(store);
        if (yes > 0n || no > 0n) pos.push({ market, yes, no });
      }
      setPositions(pos);
      const u = bank.find((b: Coin) => b.denom === env.usdcDenom);
      setUsdc(BigInt(u?.amount ?? '0'));
      setLoading(false);
    })().catch(() => setLoading(false));
    // No teardown wired here — `cancel` is read by the async closure above so
    // a late-arriving response from a stale render won't overwrite fresh state.
    // useRefreshOnTx's internal effect handles re-run scheduling.
  }, [address, markets]);

  if (!address) {
    return (
      <Empty
        title="Connect a wallet"
        description="View your prediction-market positions and open orders."
        action={<Button onClick={connect}>Connect wallet</Button>}
      />
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Account</span>
          <h1 className="mt-2 font-display text-5xl font-semibold leading-none tracking-marquee text-ink">
            Portfolio
          </h1>
          <p className="mt-3 max-w-xl text-sm text-ink-dim">
            YES/NO positions and open orders across all your active markets.
          </p>
        </div>
        <Link
          href="/"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-muted transition-colors hover:text-gold"
        >
          Browse markets →
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card variant="hero" className="bg-hero-radial">
          <span className="eyebrow">Available cash</span>
          <div className="mt-3 flex items-center gap-3">
            <CoinIcon denom={env.usdcDenom} size="lg" className="shrink-0" />
            <div className="flex items-baseline gap-2 leading-none">
              <CoinDisplay denom={env.usdcDenom} amount={usdc} icon={false} size="lg" mono />
            </div>
          </div>
        </Card>
        <FaucetCard />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Positions · {positions.length}</CardTitle>
        </CardHeader>
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded" />
            <Skeleton className="h-14 w-full rounded" />
          </div>
        )}
        {!loading && positions.length === 0 && (
          <p className="text-sm text-muted">
            No positions yet. Deposit on any market to mint YES + NO tokens.
          </p>
        )}
        {positions.length > 0 && (
          <ul className="divide-y divide-border">
            {positions.map((p) => (
              <PositionRow key={p.market.collectionId} position={p} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open orders ({intents.filter((i) => i.isActive).length})</CardTitle>
        </CardHeader>
        {intents.length === 0 && <p className="text-sm text-muted">You haven't placed any orders.</p>}
        {intents.length > 0 && (
          <ul className="space-y-2">
            {intents.map((i) => (
              <OpenOrderRow key={`${i.collectionId}:${i.approvalLevel}:${i.approvalId}`} intent={i} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
