'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useRefreshOnTx } from '@/lib/tx-bus';
import { getMarketBalances } from '@/lib/prediction-market/balances';
import { env } from '@/lib/env';
import type { MarketDto } from '@/lib/aggregator';
import { clsx } from 'clsx';

/**
 * Compact position strip between MarketHeader and tabs on the market detail
 * page. Only renders for a connected wallet with a non-zero position on this
 * market. Three cells: YES / NO / Expected value (mark-to-market at current
 * YES & NO prices).
 *
 * No available-cash or USDC bank balance — those live in the portfolio page
 * and add noise here.
 */
interface Props {
  market: MarketDto;
}

interface Balances {
  yes: bigint;
  no: bigint;
  usdc: bigint;
}

export function YourPositionBar({ market }: Props) {
  const { address } = useWallet();
  const [bal, setBal] = useState<Balances | null>(null);

  useRefreshOnTx(() => {
    if (!address) {
      setBal(null);
      return;
    }
    getMarketBalances(address, market.collectionId, market.depositDenom ?? env.usdcDenom)
      .then(setBal)
      .catch(() => setBal({ yes: 0n, no: 0n, usdc: 0n }));
  }, [address, market.collectionId, market.depositDenom]);

  if (!address || !bal) return null;
  // Skip the strip entirely when there's no exposure here.
  if (bal.yes === 0n && bal.no === 0n) return null;

  const yesUnits = Number(bal.yes) / 10 ** env.usdcDecimals;
  const noUnits = Number(bal.no) / 10 ** env.usdcDecimals;
  const yesValue = yesUnits * market.yesPrice;
  const noValue = noUnits * market.noPrice;
  const totalValue = yesValue + noValue;

  return (
    <div>
      <div className="mb-2 px-1">
        <span className="eyebrow">Your holdings</span>
      </div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded border border-border bg-border">
        <SideCell
          tone="yes"
          tokens={yesUnits}
          value={yesValue}
          priceLabel={`${(market.yesPrice * 100).toFixed(0)}%`}
        />
        <SideCell
          tone="no"
          tokens={noUnits}
          value={noValue}
          priceLabel={`${(market.noPrice * 100).toFixed(0)}%`}
        />
        <TotalCell value={totalValue} />
      </div>
    </div>
  );
}

function SideCell({
  tone,
  tokens,
  value,
  priceLabel,
}: {
  tone: 'yes' | 'no';
  tokens: number;
  value: number;
  priceLabel: string;
}) {
  const labelTone = tone === 'yes' ? 'text-yes' : 'text-no';
  const valueTone = tone === 'yes' ? 'text-yes-bright' : 'text-no-bright';
  return (
    <div className="flex flex-col gap-1 bg-panel px-4 py-3">
      <div className="flex items-center justify-between">
        <span className={clsx('eyebrow', labelTone)}>{tone.toUpperCase()}</span>
        <span className="font-mono text-[9px] tracking-[0.12em] text-faint">@ {priceLabel}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={clsx('font-mono text-xl font-semibold leading-none', valueTone)}>
          {trimNum(tokens)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">tokens</span>
      </div>
      <span className="font-mono text-[10px] tracking-[0.12em] text-faint">
        ≈ {value.toFixed(2)} {env.usdcSymbol}
      </span>
    </div>
  );
}

function TotalCell({ value }: { value: number }) {
  return (
    <div className="flex flex-col gap-1 bg-panel px-4 py-3">
      <span className="eyebrow text-gold">Expected value</span>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-semibold leading-none text-gold-bright">
          {value.toFixed(2)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {env.usdcSymbol}
        </span>
      </div>
      <span className="font-mono text-[10px] tracking-[0.12em] text-faint">
        at current quotes
      </span>
    </div>
  );
}

function trimNum(n: number): string {
  if (n === 0) return '0';
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, '');
}

