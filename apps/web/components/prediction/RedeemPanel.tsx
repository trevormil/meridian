'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useRefreshOnTx } from '@/lib/tx-bus';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { UsdcSymbol } from '@/components/ui/UsdcSymbol';
import { TxButton } from '@/components/tx/TxButton';
import { buildPredictionMarketRedeemTx, type SettlementApprovals } from '@/lib/prediction-market/sdk';
import { getMarketBalances } from '@/lib/prediction-market/balances';
import { env } from '@/lib/env';
import type { MarketDto } from '@/lib/aggregator';

interface Props {
  market: MarketDto;
  approvals: SettlementApprovals;
  onSuccess?: () => void;
}

export function RedeemPanel({ market, approvals, onSuccess }: Props) {
  const { address } = useWallet();
  const [bal, setBal] = useState<{ yes: bigint; no: bigint } | null>(null);

  // Auto-refresh after any tx (deposit, fill, redeem) — see lib/tx-bus.
  useRefreshOnTx(() => {
    if (!address) {
      setBal(null);
      return;
    }
    getMarketBalances(address, market.collectionId, market.depositDenom ?? env.usdcDenom)
      .then((b) => setBal({ yes: b.yes, no: b.no }))
      .catch(() => setBal({ yes: 0n, no: 0n }));
  }, [address, market.collectionId, market.depositDenom]);

  const state = market.status === 'resolved-yes'
    ? ('yes-wins' as const)
    : market.status === 'resolved-no'
      ? ('no-wins' as const)
      : market.status === 'resolved-push'
        ? ('push' as const)
        : ('active' as const);

  const pair = bal ? (bal.yes < bal.no ? bal.yes : bal.no) : 0n;
  const denom = market.depositDenom ?? env.usdcDenom;
  const yesDenom = `badgeslp:${market.collectionId}:uyes`;
  const noDenom = `badgeslp:${market.collectionId}:uno`;

  const payout =
    state === 'active' ? pair
    : state === 'yes-wins' ? (bal?.yes ?? 0n)
    : state === 'no-wins' ? (bal?.no ?? 0n)
    : ((bal?.yes ?? 0n) + (bal?.no ?? 0n)) / 2n; // push: 0.5 each

  function buildMsgs() {
    if (!address || !bal) return [];
    const tx = buildPredictionMarketRedeemTx({
      creator: address,
      collectionId: market.collectionId,
      state,
      pairAmount: state === 'active' ? pair : undefined,
      yesBalance: state !== 'active' ? bal.yes : undefined,
      noBalance: state !== 'active' ? bal.no : undefined,
      redeemApprovalId: approvals.redeemApprovalId,
      yesWinsApprovalId: approvals.yesWinsApprovalId,
      noWinsApprovalId: approvals.noWinsApprovalId,
      pushYesApprovalId: approvals.pushYesApprovalId,
      pushNoApprovalId: approvals.pushNoApprovalId,
    });
    return tx.messages;
  }

  const stateLabel = {
    active: 'Pre-settlement redeem',
    'yes-wins': 'YES won — claim payout',
    'no-wins': 'NO won — claim payout',
    push: 'Pushed — claim refund',
  }[state];

  const sym = <UsdcSymbol />;
  const stateDesc: React.ReactNode = {
    active: <>Burn one YES + one NO together to reclaim 1 {sym} each pair.</>,
    'yes-wins': <>YES tokens are redeemable 1:1 for {sym}. NO tokens are worthless but should be burned to clean up.</>,
    'no-wins': <>NO tokens are redeemable 1:1 for {sym}. YES tokens are worthless but should be burned to clean up.</>,
    push: <>Burn YES and NO separately, each redeems for 0.5 {sym}.</>,
  }[state];

  return (
    <Card variant="hero">
      <CardHeader>
        <CardTitle>Redeem</CardTitle>
        <span className="text-xs uppercase tracking-wider text-muted">{stateLabel}</span>
      </CardHeader>

      {!address && (
        <p className="text-sm text-muted">Connect a wallet to view your position.</p>
      )}

      {address && (
        <div className="space-y-4">
          <p className="text-sm text-muted">{stateDesc}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-yes/30 bg-yes-gradient p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-yes">YES Position</div>
              <div className="mt-1">
                <CoinDisplay denom={yesDenom} amount={bal?.yes ?? 0n} icon={false} size="lg" mono />
              </div>
            </div>
            <div className="rounded-lg border border-no/30 bg-no-gradient p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-no">NO Position</div>
              <div className="mt-1">
                <CoinDisplay denom={noDenom} amount={bal?.no ?? 0n} icon={false} size="lg" mono />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-bg/60 p-3">
            <span className="text-sm text-muted">You receive</span>
            <CoinDisplay denom={denom} amount={payout} size="md" />
          </div>

          <TxButton
            label="Redeem"
            disabled={!bal || (state === 'active' ? pair === 0n : bal.yes === 0n && bal.no === 0n)}
            build={buildMsgs}
            onSuccess={() => {
              // tx-bus handles balance refresh automatically; just forward.
              onSuccess?.();
            }}
          />
        </div>
      )}
    </Card>
  );
}
