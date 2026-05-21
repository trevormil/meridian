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
  const disabled = !address || !mintApprovalId || tokenAmt === 0n || insufficient;

  // useRefreshOnTx fires on mount AND whenever any tx confirms on chain. The
  // bus emit waits for the actual block commit (Cosmos DeliverTx or EVM
  // receipt), so we know the bank query will see post-tx state.
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

      <p className="mb-5 text-xs leading-relaxed text-faint">
        Mint paired YES + NO tokens. Trade either side, or redeem the winner 1:1 after settle.
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

      {/* Receive preview — YES and NO mint amounts side-by-side */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <ReceiveRow
          side="yes"
          denom={`badgeslp:${collectionId}:uyes`}
          amount={amount || '0'}
        />
        <ReceiveRow
          side="no"
          denom={`badgeslp:${collectionId}:uno`}
          amount={amount || '0'}
        />
      </div>

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

function ReceiveRow({ side, denom, amount }: { side: 'yes' | 'no'; denom: string; amount: string }) {
  const tone =
    side === 'yes'
      ? 'border-yes/30 bg-yes/5 text-yes'
      : 'border-no/30 bg-no/5 text-no';
  return (
    <div className={`flex items-center justify-between rounded border ${tone} px-3 py-2`}>
      <span className="flex items-center gap-2">
        <CoinIcon denom={denom} size="sm" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {side.toUpperCase()}
        </span>
      </span>
      <span className="font-mono text-sm text-ink">+{amount}</span>
    </div>
  );
}
