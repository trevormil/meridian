'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useRefreshOnTx } from '@/lib/tx-bus';
import { getMarketBalances } from '@/lib/prediction-market/balances';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { UsdcSymbol } from '@/components/ui/UsdcSymbol';
import { TxButton } from '@/components/tx/TxButton';
import { type IntentDto, type MarketDto } from '@/lib/aggregator';
import { buildIntentMsg, type Side, type Direction } from '@/lib/prediction-market/intents';
import { toMicroUsdc } from '@/lib/format';
import { env } from '@/lib/env';
import { IntentTable, GroupedIntents } from './IntentTable';
import { OrderBookDepth } from './OrderBookDepth';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import { clsx } from 'clsx';

interface Props {
  market: MarketDto;
}

type SubTab = 'depth' | 'all' | 'my';

/**
 * Place-order form, standalone export. Composed into the merged Market view
 * (chart + book + form) — see MarketOverviewTab.
 */
export function PlaceOrderCard({ market }: Props) {
  return <NewIntentForm market={market} onSuccess={() => {}} />;
}

/**
 * Order book card (Depth / All / Mine sub-tabs), standalone export. Realtime
 * intent set streamed per-collection; per-owner channel filtered to this market.
 */
export function OrderBookCard({ market }: Props) {
  const { address } = useWallet();
  const [subTab, setSubTab] = useState<SubTab>('depth');
  const book = useRealtime<IntentDto[]>(ch.intents(market.collectionId)) ?? [];
  const ownerIntents = useRealtime<IntentDto[]>(address ? ch.intentsOwner(address) : null) ?? [];
  const mine = ownerIntents.filter((i) => i.collectionId === market.collectionId);
  const onTx = () => {};

  return (
    <Card>
      <CardHeader>
        <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1">
          <TabBtn label="Depth" active={subTab === 'depth'} onClick={() => setSubTab('depth')} />
          <TabBtn label={`All (${book.length})`} active={subTab === 'all'} onClick={() => setSubTab('all')} />
          {address && <TabBtn label={`Mine (${mine.length})`} active={subTab === 'my'} onClick={() => setSubTab('my')} />}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wider text-yes">
          <span className="h-1.5 w-1.5 rounded-full bg-yes animate-pulse-soft" /> live
        </span>
      </CardHeader>
      {subTab === 'depth' && <OrderBookDepth book={book} collectionId={market.collectionId} />}
      {subTab === 'all' && <GroupedIntents rows={book} collectionId={market.collectionId} onTx={onTx} />}
      {subTab === 'my' && <IntentTable rows={mine} collectionId={market.collectionId} isMy onTx={onTx} />}
    </Card>
  );
}

/** Legacy standalone panel (form + book side by side). Kept for reference;
 *  the market detail page now uses the merged MarketOverviewTab layout. */
export function IntentsPanel({ market }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <PlaceOrderCard market={market} />
      </div>
      <div className="space-y-4 lg:col-span-2">
        <OrderBookCard market={market} />
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded px-3 py-1 text-sm font-medium transition-colors',
        active ? 'bg-border text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}

const EXPIRY_PRESETS: Array<{ label: string; seconds: number }> = [
  { label: '1h', seconds: 60 * 60 },
  { label: '6h', seconds: 6 * 60 * 60 },
  { label: '24h', seconds: 24 * 60 * 60 },
  { label: '7d', seconds: 7 * 24 * 60 * 60 },
];

function NewIntentForm({ market, onSuccess }: { market: MarketDto; onSuccess: () => void }) {
  const { address } = useWallet();
  const [side, setSide] = useState<Side>('yes');
  const [direction, setDirection] = useState<Direction>('buy');
  const [tokenAmount, setTokenAmount] = useState('10');
  const [customMode, setCustomMode] = useState(false);
  /** Custom-entered implied probability percent (0–100). Only used when customMode is on. */
  const [customPricePct, setCustomPricePct] = useState('50');
  const [expirySec, setExpirySec] = useState(EXPIRY_PRESETS[2].seconds);
  const [balances, setBalances] = useState<{ yes: bigint; no: bigint; usdc: bigint } | null>(null);

  // Pull live USDC + YES/NO balances. Auto-refresh on every tx confirm so
  // the "Max" button reflects post-trade state without a manual reload.
  useRefreshOnTx(() => {
    if (!address) {
      setBalances(null);
      return;
    }
    getMarketBalances(address, market.collectionId, market.depositDenom ?? env.usdcDenom)
      .then(setBalances)
      .catch(() => setBalances({ yes: 0n, no: 0n, usdc: 0n }));
  }, [address, market.collectionId, market.depositDenom]);

  // Live market price (% form). Defaults to this unless user opts into custom.
  const marketPct = ((side === 'yes' ? market.yesPrice : market.noPrice) * 100).toFixed(1);
  const pricePct = customMode ? customPricePct : marketPct;

  const tokenAmt = toMicroUsdc(tokenAmount);
  const priceNum = Math.max(0, Math.min(100, Number(pricePct)));
  const decimalPrice = priceNum / 100;
  const coinAmt = toMicroUsdc((Number(tokenAmount) * decimalPrice).toString());

  // Sell-side max = YES or NO balance the user holds (whole tokens). Buy-side
  // intentionally has no balance display — a posted buy intent doesn't move
  // USDC until someone fills it, so "current cash" isn't load-bearing on the
  // Quantity field. The Preview row below shows the implied USDC cost.
  const decimals = env.usdcDecimals;
  const sideBalanceBase = side === 'yes' ? balances?.yes ?? 0n : balances?.no ?? 0n;
  const sideBalanceUnits = Number(sideBalanceBase) / 10 ** decimals;
  const insufficient =
    direction === 'sell' && Number(tokenAmount || '0') > sideBalanceUnits + 1e-9;
  const showSellMax = direction === 'sell' && address !== null && balances !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Place order</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <SegBtn label="Buy" active={direction === 'buy'} variant="yes" onClick={() => setDirection('buy')} />
          <SegBtn label="Sell" active={direction === 'sell'} variant="no" onClick={() => setDirection('sell')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SegBtn label="YES" active={side === 'yes'} variant="yes" onClick={() => setSide('yes')} />
          <SegBtn label="NO" active={side === 'no'} variant="no" onClick={() => setSide('no')} />
        </div>

        <div>
          <div className="mb-1 flex items-end justify-between text-xs">
            <span className="text-muted">Quantity</span>
            {showSellMax && (
              <span className="flex items-center gap-2 font-mono text-[10px] text-faint">
                <span>
                  Your {side.toUpperCase()}: {trimNum(sideBalanceUnits)}
                </span>
                <button
                  type="button"
                  disabled={sideBalanceUnits <= 0}
                  onClick={() => setTokenAmount(trimNum(sideBalanceUnits))}
                  className="rounded-sm border border-border bg-bg-deep px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-gold transition-colors hover:border-gold/50 hover:text-gold-bright disabled:opacity-30 disabled:hover:border-border"
                >
                  Max
                </button>
              </span>
            )}
          </div>
          <Input value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} type="number" min="0" />
          {insufficient && (
            <p className="mt-1 text-[10px] text-no-bright">
              Insufficient {side.toUpperCase()} balance
            </p>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Price</span>
            {customMode ? (
              <button
                type="button"
                onClick={() => setCustomMode(false)}
                className="text-accent hover:underline"
              >
                Use market price
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCustomPricePct(marketPct);
                  setCustomMode(true);
                }}
                className="text-accent hover:underline"
              >
                Edit custom
              </button>
            )}
          </div>
          {customMode ? (
            <>
              <div className="flex items-center gap-2">
                <Input
                  value={customPricePct}
                  onChange={(e) => setCustomPricePct(e.target.value)}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                />
                <span className="text-sm text-muted">%</span>
              </div>
              <input
                type="range"
                min="1"
                max="99"
                step="1"
                value={priceNum}
                onChange={(e) => setCustomPricePct(e.target.value)}
                className="mt-2 w-full accent-accent"
              />
            </>
          ) : (
            <div className="flex h-10 items-center justify-between rounded border border-border bg-bg-deep px-3">
              <span className="font-mono text-sm text-ink">{marketPct}%</span>
              <span className="text-[10px] uppercase tracking-wider text-muted">market</span>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs text-muted">Expires in</div>
          <div className="grid grid-cols-4 gap-1">
            {EXPIRY_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setExpirySec(p.seconds)}
                className={clsx(
                  'rounded border px-2 py-1 text-xs',
                  expirySec === p.seconds ? 'border-accent text-accent' : 'border-border text-muted hover:text-ink',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <Preview
          direction={direction}
          side={side}
          tokenAmount={tokenAmount}
          totalUsdc={Number(tokenAmount) * decimalPrice}
        />

        <TxButton
          fullWidth
          label={`${direction === 'buy' ? 'Buy' : 'Sell'} ${tokenAmount || '0'} ${side.toUpperCase()}`}
          variant={side === 'yes' ? 'yes' : 'no'}
          disabled={!address || tokenAmt === 0n || coinAmt === 0n || insufficient}
          build={() => {
            if (!address) return [];
            return [
              buildIntentMsg({
                address,
                collectionId: market.collectionId,
                side,
                direction,
                tokenAmount: tokenAmt,
                paymentAmount: coinAmt,
                paymentDenom: market.depositDenom ?? env.usdcDenom,
                expirySeconds: expirySec,
              }),
            ];
          }}
          onSuccess={onSuccess}
        />
      </div>
    </Card>
  );
}

function trimNum(n: number): string {
  if (n === 0) return '0';
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, '');
}

function SegBtn({
  label,
  active,
  variant,
  onClick,
}: {
  label: string;
  active: boolean;
  variant: 'yes' | 'no';
  onClick: () => void;
}) {
  const activeCls = variant === 'yes' ? 'border-yes bg-yes/10 text-yes' : 'border-no bg-no/10 text-no';
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded border px-3 py-2 text-sm',
        active ? activeCls : 'border-border text-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}

function Preview({
  direction,
  side,
  tokenAmount,
  totalUsdc,
}: {
  direction: Direction;
  side: Side;
  tokenAmount: string;
  totalUsdc: number;
}) {
  return (
    <div className="rounded border border-border bg-bg-deep p-3 text-xs">
      <div className="flex justify-between">
        <span className="text-muted">You {direction === 'buy' ? 'pay' : 'receive'}</span>
        <span className="flex items-center gap-1 font-mono">{totalUsdc.toFixed(4)} <UsdcSymbol /></span>
      </div>
      <div className="mt-1 flex justify-between">
        <span className="text-muted">You {direction === 'buy' ? 'receive' : 'send'}</span>
        <span className={clsx('font-mono', side === 'yes' ? 'text-yes' : 'text-no')}>
          {tokenAmount || '0'} {side.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
