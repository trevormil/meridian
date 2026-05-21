'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { useWallet } from '@/contexts/WalletContext';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { TxButton } from '@/components/tx/TxButton';
import { buildResolveMsgs, type SettlementApprovals } from '@/lib/prediction-market/sdk';
import { shortAddr } from '@/lib/format';
import type { MarketDto } from '@/lib/aggregator';

interface Props {
  market: MarketDto;
  approvals: SettlementApprovals;
  onSuccess?: () => void;
}

const outcomes = [
  { key: 'yes' as const, label: 'YES wins', sub: 'Yes-token holders redeem 1:1', variant: 'yes' as const },
  { key: 'no' as const, label: 'NO wins', sub: 'No-token holders redeem 1:1', variant: 'no' as const },
  { key: 'push' as const, label: 'Push (refund)', sub: 'Both sides receive ½ payout', variant: 'primary' as const },
];

export function SettlePanel({ market, approvals, onSuccess }: Props) {
  const { address } = useWallet();
  const [outcome, setOutcome] = useState<'yes' | 'no' | 'push'>('yes');
  const isVerifier = address && market.verifierAddress && address === market.verifierAddress;
  const alreadyResolved = market.status.startsWith('resolved-');

  if (!isVerifier) {
    return (
      <Card variant="hero" accent={null}>
        <CardHeader>
          <CardTitle>Settlement</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted">
          Only the designated verifier can settle this market.
        </p>
        <p className="mt-2 text-xs font-mono text-muted">
          {shortAddr(market.verifierAddress)}
        </p>
      </Card>
    );
  }

  if (alreadyResolved) {
    const resolvedLabel = {
      'resolved-yes': 'YES',
      'resolved-no': 'NO',
      'resolved-push': 'Push',
    }[market.status as 'resolved-yes' | 'resolved-no' | 'resolved-push'];
    return (
      <Card variant="hero">
        <CardHeader>
          <CardTitle>Settlement</CardTitle>
        </CardHeader>
        <p className="text-sm">
          This market has been resolved as <span className="font-semibold text-ink">{resolvedLabel}</span>.
          Holders can now redeem their tokens.
        </p>
      </Card>
    );
  }

  return (
    <Card variant="hero">
      <CardHeader>
        <CardTitle>Cast verifier vote</CardTitle>
        <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          Verifier
        </span>
      </CardHeader>

      <p className="mb-4 text-sm text-muted">
        You're the designated verifier for this market. Cast a vote to unlock the
        corresponding redemption path. <span className="text-no">Irreversible.</span>
      </p>

      <div className="mb-4 space-y-2">
        {outcomes.map((o) => (
          <button
            key={o.key}
            onClick={() => setOutcome(o.key)}
            className={clsx(
              'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all',
              outcome === o.key
                ? o.variant === 'yes'
                  ? 'border-yes bg-yes-gradient'
                  : o.variant === 'no'
                    ? 'border-no bg-no-gradient'
                    : 'border-accent bg-accent/10'
                : 'border-border bg-bg/40 hover:border-border-hi',
            )}
          >
            <div>
              <div className={clsx(
                'text-sm font-semibold',
                o.variant === 'yes' ? 'text-yes' : o.variant === 'no' ? 'text-no' : 'text-accent',
              )}>
                {o.label}
              </div>
              <div className="text-xs text-muted">{o.sub}</div>
            </div>
            <div className={clsx(
              'h-4 w-4 rounded-full border-2',
              outcome === o.key
                ? o.variant === 'yes'
                  ? 'border-yes bg-yes'
                  : o.variant === 'no'
                    ? 'border-no bg-no'
                    : 'border-accent bg-accent'
                : 'border-border',
            )} />
          </button>
        ))}
      </div>

      <TxButton
        label={`Resolve as ${outcome.toUpperCase()}`}
        variant={outcome === 'yes' ? 'yes' : outcome === 'no' ? 'no' : 'primary'}
        build={() => {
          if (!address) return [];
          return buildResolveMsgs({
            creator: address,
            collectionId: market.collectionId,
            outcome,
            approvals,
          });
        }}
        onSuccess={onSuccess}
      />
    </Card>
  );
}
