'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { AmountInput } from '@/components/ui/AmountInput';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { TxButton } from '@/components/tx/TxButton';
import { buildPredictionMarketDepositMsg } from '@/lib/prediction-market/sdk';
import { getMarketBalances } from '@/lib/prediction-market/balances';
import { parseAmount } from '@/lib/coins';
import { env } from '@/lib/env';
import type { MarketDto } from '@/lib/aggregator';

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
  const [tick, setTick] = useState(0);

  const depositDenom = market?.depositDenom ?? env.usdcDenom;
  const tokenAmt = parseAmount(amount, env.usdcDecimals);
  const insufficient = balance !== null && tokenAmt > balance;
  const disabled = !address || !mintApprovalId || tokenAmt === 0n || insufficient;

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }
    getMarketBalances(address, collectionId, depositDenom)
      .then((b) => setBalance(b.usdc))
      .catch(() => setBalance(0n));
  }, [address, collectionId, depositDenom, tick]);

  return (
    <Card variant="hero">
      <CardHeader>
        <CardTitle>Deposit</CardTitle>
        <span className="text-xs text-muted">1 {env.usdcSymbol} → 1 YES + 1 NO</span>
      </CardHeader>

      <p className="mb-5 text-sm text-muted">
        Deposit {env.usdcSymbol} to mint paired YES + NO outcome tokens. Trade either side, or redeem the
        winner 1:1 after the market settles.
      </p>

      <AmountInput
        label="Amount"
        denom={depositDenom}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        balance={balance ?? undefined}
        onMax={(d) => setAmount(d)}
        error={insufficient ? 'Insufficient balance' : undefined}
      />

      {/* Receive preview */}
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg/60 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CoinIcon denom={`badgeslp:${collectionId}:uyes`} size="sm" />
            <span className="text-xs text-yes font-semibold">YES</span>
          </span>
          <span className="font-mono text-sm">{amount || '0'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CoinIcon denom={`badgeslp:${collectionId}:uno`} size="sm" />
            <span className="text-xs text-no font-semibold">NO</span>
          </span>
          <span className="font-mono text-sm">{amount || '0'}</span>
        </div>
      </div>

      <div className="mt-5">
        <TxButton
          label={tokenAmt === 0n ? 'Enter amount' : `Deposit ${amount} ${env.usdcSymbol}`}
          disabled={disabled}
          build={() => {
            if (!address || !mintApprovalId) return [];
            return [buildPredictionMarketDepositMsg(address, collectionId, tokenAmt, mintApprovalId)];
          }}
          onSuccess={() => {
            setTick((t) => t + 1);
            onSuccess?.();
          }}
        />
      </div>

      {!mintApprovalId && (
        <p className="mt-3 text-xs text-no">Mint approval not found — this collection may not be a valid prediction market.</p>
      )}
    </Card>
  );
}
