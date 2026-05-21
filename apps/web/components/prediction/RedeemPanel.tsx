'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useRefreshOnTx } from '@/lib/tx-bus';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { TxButton } from '@/components/tx/TxButton';
import { buildPredictionMarketRedeemTx, type SettlementApprovals } from '@/lib/prediction-market/sdk';
import { getMarketBalances } from '@/lib/prediction-market/balances';
import { env } from '@/lib/env';
import type { MarketDto } from '@/lib/aggregator';
import { clsx } from 'clsx';

/**
 * Redeem panel — mirrors the bitbadges-frontend "PredictionRedeemPanel" layout:
 * one Conversion row per side ("X YES → Y USDC" or "X NO → burn (no payout)"),
 * a TOTAL_PAYOUT footer summing the winnings, and a single "Redeem All" CTA.
 * Empty state when the user holds neither YES nor NO.
 */
interface Props {
  market: MarketDto;
  approvals: SettlementApprovals;
  onSuccess?: () => void;
}

export function RedeemPanel({ market, approvals, onSuccess }: Props) {
  const { address } = useWallet();
  const [bal, setBal] = useState<{ yes: bigint; no: bigint } | null>(null);

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

  const denom = market.depositDenom ?? env.usdcDenom;
  const yesDenom = `badgeslp:${market.collectionId}:uyes`;
  const noDenom = `badgeslp:${market.collectionId}:uno`;

  const yesBal = bal?.yes ?? 0n;
  const noBal = bal?.no ?? 0n;
  const pair = yesBal < noBal ? yesBal : noBal;
  const hasYes = yesBal > 0n;
  const hasNo = noBal > 0n;
  const hasAny = hasYes || hasNo;

  // Effective amounts that will burn + payout amounts per side. Mirrors the
  // FE bitbadges PredictionRedeemPanel math so behavior stays consistent.
  const yesBurn = state === 'active' ? pair : yesBal;
  const noBurn = state === 'active' ? pair : noBal;
  const yesPayout =
    state === 'active' ? pair : state === 'push' ? yesBal / 2n : state === 'yes-wins' ? yesBal : 0n;
  const noPayout =
    state === 'active' ? pair : state === 'push' ? noBal / 2n : state === 'no-wins' ? noBal : 0n;
  const totalPayout = yesPayout + noPayout;

  const stateChip = {
    active: { label: 'Pre-settlement', tone: 'border-gold/40 bg-gold/10 text-gold' },
    'yes-wins': { label: 'YES won', tone: 'border-yes/40 bg-yes/10 text-yes-bright' },
    'no-wins': { label: 'NO won', tone: 'border-no/40 bg-no/10 text-no-bright' },
    push: { label: 'Push', tone: 'border-amber/40 bg-amber/10 text-amber' },
  }[state];

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

  return (
    <Card variant="hero">
      <CardHeader>
        <CardTitle>Redeem</CardTitle>
        <span
          className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] ${stateChip.tone}`}
        >
          {stateChip.label}
        </span>
      </CardHeader>

      {!address && (
        <p className="text-xs text-faint">Connect a wallet to view your position.</p>
      )}

      {address && !hasAny && (
        <p className="py-6 text-center text-xs text-faint">
          You don't hold any YES or NO tokens on this market.
        </p>
      )}

      {address && hasAny && (
        <div className="space-y-3">
          {hasYes && (
            <ConversionRow
              side="yes"
              tokenAmount={yesBurn}
              tokenDenom={yesDenom}
              coinAmount={yesPayout}
              coinDenom={denom}
            />
          )}
          {hasNo && (
            <ConversionRow
              side="no"
              tokenAmount={noBurn}
              tokenDenom={noDenom}
              coinAmount={noPayout}
              coinDenom={denom}
            />
          )}

          {/* Total payout summary — USDC with logo */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="eyebrow text-gold">Total payout</span>
            <span className="text-base font-semibold text-gold-bright">
              <CoinDisplay denom={denom} amount={totalPayout} size="md" mono />
            </span>
          </div>

          <TxButton
            fullWidth
            label="Redeem all"
            disabled={!bal || (state === 'active' ? pair === 0n : !hasAny)}
            build={buildMsgs}
            onSuccess={() => {
              onSuccess?.();
            }}
          />
        </div>
      )}
    </Card>
  );
}

function ConversionRow({
  side,
  tokenAmount,
  tokenDenom,
  coinAmount,
  coinDenom,
}: {
  side: 'yes' | 'no';
  tokenAmount: bigint;
  tokenDenom: string;
  coinAmount: bigint;
  coinDenom: string;
}) {
  const isBurnOnly = coinAmount === 0n;
  const tone =
    side === 'yes' ? 'border-yes/30 bg-yes/5' : 'border-no/30 bg-no/5';
  const labelTone = side === 'yes' ? 'text-yes' : 'text-no';
  return (
    <div
      className={clsx(
        'rounded border px-4 py-3 transition-opacity',
        tone,
        isBurnOnly && 'opacity-50',
      )}
    >
      <div className={clsx('eyebrow mb-2', labelTone)}>{side.toUpperCase()}</div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="text-base font-semibold text-ink">
          {/* token side — no icon (YES/NO has its own eyebrow + token label) */}
          <CoinDisplay denom={tokenDenom} amount={tokenAmount} icon={false} size="md" mono />
        </span>
        <span className="text-muted">→</span>
        <span className="text-right text-base font-semibold text-ink">
          {isBurnOnly ? (
            <span className="font-mono text-muted">Burn · no payout</span>
          ) : (
            /* USDC payout — show the coin logo so the side that PAYS reads as cash */
            <CoinDisplay denom={coinDenom} amount={coinAmount} size="md" mono />
          )}
        </span>
      </div>
    </div>
  );
}
