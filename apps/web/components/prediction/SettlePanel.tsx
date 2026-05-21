'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { useWallet } from '@/contexts/WalletContext';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { TxButton } from '@/components/tx/TxButton';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { buildResolveMsgs, type SettlementApprovals } from '@/lib/prediction-market/sdk';
import { aggregator, type MarketDto } from '@/lib/aggregator';

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
        <div className="mt-2">
          <AddressDisplay address={market.verifierAddress} size={14} className="text-muted" />
        </div>
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
        <span className="inline-flex items-center gap-1 rounded-sm border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-gold">
          Verifier
        </span>
      </CardHeader>

      <p className="mb-4 text-xs leading-relaxed text-faint">
        Settle this market. Cast a vote to unlock the corresponding redemption path.
      </p>

      <div className="mb-4 rounded border border-no/30 bg-no/5 px-3 py-2 text-[11px] leading-relaxed text-no-bright">
        ⚠ Irreversible — once cast, the vote cannot be undone.
      </div>

      <div className="mb-5 space-y-2">
        {outcomes.map((o) => (
          <button
            key={o.key}
            onClick={() => setOutcome(o.key)}
            className={clsx(
              'flex w-full items-center justify-between rounded border px-4 py-3 text-left transition-all',
              outcome === o.key
                ? o.variant === 'yes'
                  ? 'border-yes bg-yes-gradient'
                  : o.variant === 'no'
                    ? 'border-no bg-no-gradient'
                    : 'border-gold bg-gold/10'
                : 'border-border bg-bg-deep hover:border-border-hi',
            )}
          >
            <div>
              <div
                className={clsx(
                  'text-sm font-semibold',
                  o.variant === 'yes'
                    ? 'text-yes-bright'
                    : o.variant === 'no'
                      ? 'text-no-bright'
                      : 'text-gold',
                )}
              >
                {o.label}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">{o.sub}</div>
            </div>
            <div
              className={clsx(
                'h-4 w-4 shrink-0 rounded-full border-2 transition-colors',
                outcome === o.key
                  ? o.variant === 'yes'
                    ? 'border-yes bg-yes'
                    : o.variant === 'no'
                      ? 'border-no bg-no'
                      : 'border-gold bg-gold'
                  : 'border-border-bright',
              )}
            />
          </button>
        ))}
      </div>

      <TxButton
        fullWidth
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
        onSuccess={async () => {
          // The aggregator's live tx-watcher *usually* picks up the cast_vote
          // event and flips status within a tick, but the WS stream occasionally
          // misses txs. Synchronously poke /refresh-fills so the vote is
          // recorded + status published on the market realtime channel before
          // the user looks at the page. Without this, the UI can lag until the
          // next 30s backfill loop.
          try {
            await aggregator.refreshFills(market.collectionId);
          } catch {
            // non-fatal — tx already on-chain; backfill loop will reconcile.
          }
          onSuccess?.();
        }}
      />
    </Card>
  );
}
