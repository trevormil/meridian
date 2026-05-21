'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useRefreshOnTx } from '@/lib/tx-bus';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { AmountInput } from '@/components/ui/AmountInput';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { UsdcSymbol } from '@/components/ui/UsdcSymbol';
import { TxButton } from '@/components/tx/TxButton';
import { buildPredictionMarketDepositMsg } from '@/lib/prediction-market/sdk';
import { getMarketBalances } from '@/lib/prediction-market/balances';
import { parseAmount } from '@/lib/coins';
import { env } from '@/lib/env';
import type { MarketDto } from '@/lib/aggregator';

/**
 * Deposit panel — mirrors the bitbadges-frontend "PredictionDepositPanel"
 * layout: amount input on top, then a "You Pay → You Receive" swap card
 * appears once a non-zero amount is entered. Receive side lists YES + NO
 * stacked (each = amount). Full-width Deposit CTA at the bottom.
 */
interface Props {
  collectionId: string;
  mintApprovalId: string | undefined;
  market?: MarketDto;
  onSuccess?: () => void;
}

export function DepositPanel({ collectionId, mintApprovalId, market, onSuccess }: Props) {
  const { address } = useWallet();
  const [amount, setAmount] = useState('10');
  const [balance, setBalance] = useState<bigint | null>(null);

  const depositDenom = market?.depositDenom ?? env.usdcDenom;
  const tokenAmt = parseAmount(amount, env.usdcDecimals);
  const insufficient = balance !== null && tokenAmt > balance;
  const showSwap = tokenAmt > 0n;
  const disabled = !address || !mintApprovalId || tokenAmt === 0n || insufficient;

  useRefreshOnTx(() => {
    if (!address) {
      setBalance(null);
      return;
    }
    getMarketBalances(address, collectionId, depositDenom)
      .then((b) => setBalance(b.usdc))
      .catch(() => setBalance(0n));
  }, [address, collectionId, depositDenom]);

  return (
    <Card variant="hero">
      <CardHeader>
        <CardTitle>Deposit</CardTitle>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          1 <UsdcSymbol /> → 1 YES + 1 NO
        </span>
      </CardHeader>

      <AmountInput
        label="Amount"
        denom={depositDenom}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        balance={balance ?? undefined}
        onMax={(d) => setAmount(d)}
        error={insufficient ? 'Insufficient balance' : undefined}
      />

      {showSwap && (
        <div className="mt-5 space-y-2">
          {/* You pay — USDC with logo */}
          <div className="rounded border border-border bg-bg-deep px-4 py-3">
            <div className="eyebrow mb-1.5">You pay</div>
            <div className="text-xl font-semibold text-ink">
              <CoinDisplay denom={depositDenom} amount={tokenAmt} size="md" mono />
            </div>
          </div>

          {/* Swap arrow */}
          <div className="flex justify-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-panel-2 text-gold">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </div>
          </div>

          {/* You receive */}
          <div className="rounded border border-border bg-bg-deep px-4 py-3">
            <div className="eyebrow mb-2">You receive</div>
            <div className="space-y-2">
              <ReceiveLine
                denom={`badgeslp:${collectionId}:uyes`}
                side="yes"
                amount={amount || '0'}
              />
              <ReceiveLine
                denom={`badgeslp:${collectionId}:uno`}
                side="no"
                amount={amount || '0'}
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-5">
        <TxButton
          fullWidth
          label={tokenAmt === 0n ? 'Enter amount' : `Deposit ${amount} ${env.usdcSymbol}`}
          disabled={disabled}
          build={() => {
            if (!address || !mintApprovalId) return [];
            return [buildPredictionMarketDepositMsg(address, collectionId, tokenAmt, mintApprovalId)];
          }}
          onSuccess={() => {
            onSuccess?.();
          }}
        />
      </div>

      {!mintApprovalId && (
        <p className="mt-3 text-xs text-no-bright">
          Mint approval not found — this collection may not be a valid prediction market.
        </p>
      )}
    </Card>
  );
}

function ReceiveLine({ denom, side, amount }: { denom: string; side: 'yes' | 'no'; amount: string }) {
  const tone = side === 'yes' ? 'text-yes-bright' : 'text-no-bright';
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <CoinIcon denom={denom} size="xs" />
        <span className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${tone}`}>
          {side.toUpperCase()}
        </span>
      </span>
      <span className={`font-mono text-base font-semibold ${tone}`}>+{amount}</span>
    </div>
  );
}
