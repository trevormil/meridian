'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
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

export function IntentsPanel({ market }: Props) {
  const { address } = useWallet();
  // Depth view is the default landing — the exchange-style ladders give the
  // best read on liquidity at a glance. Power users can flip to All / Mine
  // for the row-by-row table view + cancel buttons.
  const [subTab, setSubTab] = useState<SubTab>('depth');

  // Realtime — server pushes the full intent set for the market whenever
  // any intent is added, cancelled, filled, or expires. Per-owner channel
  // streams the connected user's orders across all markets; we filter to
  // this collection client-side.
  const book = useRealtime<IntentDto[]>(ch.intents(market.collectionId)) ?? [];
  const ownerIntents = useRealtime<IntentDto[]>(address ? ch.intentsOwner(address) : null) ?? [];
  const mine = ownerIntents.filter((i) => i.collectionId === market.collectionId);
  // No-op kept for child components that pass an after-tx callback. Real-time
  // pushes from the aggregator make the manual tick unnecessary.
  const onTx = () => {};

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <NewIntentForm market={market} onSuccess={onTx} />
      </div>
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-1">
              <TabBtn label="Depth" active={subTab === 'depth'} onClick={() => setSubTab('depth')} />
              <TabBtn label={`All (${book.length})`} active={subTab === 'all'} onClick={() => setSubTab('all')} />
              {address && <TabBtn label={`Mine (${mine.length})`} active={subTab === 'my'} onClick={() => setSubTab('my')} />}
            </div>
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-yes">
              <span className="h-1.5 w-1.5 rounded-full bg-yes animate-pulse-soft" /> live
            </span>
          </CardHeader>
          {subTab === 'depth' && <OrderBookDepth book={book} collectionId={market.collectionId} />}
          {subTab === 'all' && <GroupedIntents rows={book} collectionId={market.collectionId} onTx={onTx} />}
          {subTab === 'my' && (
            <IntentTable rows={mine} collectionId={market.collectionId} isMy onTx={onTx} />
          )}
        </Card>
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

  // Live market price (% form). Defaults to this unless user opts into custom.
  const marketPct = ((side === 'yes' ? market.yesPrice : market.noPrice) * 100).toFixed(1);
  const pricePct = customMode ? customPricePct : marketPct;

  const tokenAmt = toMicroUsdc(tokenAmount);
  const priceNum = Math.max(0, Math.min(100, Number(pricePct)));
  const decimalPrice = priceNum / 100;
  const coinAmt = toMicroUsdc((Number(tokenAmount) * decimalPrice).toString());

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

        <label className="block text-xs text-muted">
          Quantity
          <Input value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} type="number" min="0" />
        </label>

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
          disabled={!address || tokenAmt === 0n || coinAmt === 0n}
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
