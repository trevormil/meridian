'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { env } from '@/lib/env';
import { txBus } from '@/lib/tx-bus';
import { useToast } from '@/components/ui/Toasts';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { CoinLogo } from '@/components/ui/CoinLogo';

interface FaucetStatus {
  enabled: boolean;
  address?: string;
  balance?: string;
  perClaim?: string;
  denom?: string;
  claimsLeft?: number;
  reason?: string;
}

/**
 * Dev-only USDC tap. Hits the aggregator's /api/v0/faucet/claim endpoint
 * which signs an MsgSend from a seeded chain key. Auto-hides when the
 * aggregator reports the faucet is disabled (fixtures/faucet.json missing).
 */
export function FaucetCard() {
  const { address } = useWallet();
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const refresh = async () => {
    try {
      const r = await fetch(`${env.aggregatorUrl}/api/v0/faucet/status`, { cache: 'no-store' });
      const j = (await r.json()) as FaucetStatus;
      setStatus(j);
    } catch {
      setStatus({ enabled: false, reason: 'unreachable' });
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  if (!status) return null;
  if (!status.enabled) return null;

  const perClaimDisplay = status.perClaim
    ? (Number(status.perClaim) / 10 ** env.usdcDecimals).toFixed(0)
    : '10';
  const balanceDisplay = status.balance
    ? (Number(status.balance) / 10 ** env.usdcDecimals).toFixed(0)
    : '0';

  async function claim() {
    if (!address) return;
    setBusy(true);
    try {
      const r = await fetch(`${env.aggregatorUrl}/api/v0/faucet/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const j = await r.json();
      if (j.ok) {
        // tx-bus emit triggers every chain-direct query (portfolio USDC,
        // deposit panel balance, etc) to refetch with post-send state. The
        // ToastProvider subscribes to the bus and auto-fires a "Tx confirmed"
        // toast, so no manual toast here.
        txBus.emit(String(j.txHash));
      } else {
        toast.show({
          kind: 'error',
          title: 'Faucet claim failed',
          detail: j.detail ?? j.error ?? 'unknown error',
        });
      }
      await refresh();
    } catch (e) {
      toast.show({ kind: 'error', title: 'Faucet error', detail: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Faucet</CardTitle>
        <span className="text-[10px] uppercase tracking-wider text-muted">dev only</span>
      </CardHeader>
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-sm text-muted">
          Tap {perClaimDisplay} <CoinLogo denom={env.usdcSymbol} size={14} /> {env.usdcSymbol} from the dev faucet to your connected wallet.
        </p>
        <div className="flex items-center justify-between rounded border border-border bg-bg/60 p-3 text-xs">
          <div>
            <div className="text-muted">Faucet balance</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <CoinLogo denom={env.usdcSymbol} size={14} />
              <span className="font-mono text-ink">{balanceDisplay} {env.usdcSymbol}</span>
              <span className="text-muted">({status.claimsLeft ?? 0} claims left)</span>
            </div>
          </div>
          {status.address && (
            <div className="text-right">
              <div className="text-muted">From</div>
              <AddressDisplay address={status.address} size={12} copyable={false} className="text-ink" />
            </div>
          )}
        </div>
        <Button
          onClick={claim}
          loading={busy}
          disabled={!address || (status.claimsLeft ?? 0) === 0}
          className="w-full"
        >
          {address ? `Claim ${perClaimDisplay} ${env.usdcSymbol}` : 'Connect a wallet first'}
        </Button>
      </div>
    </Card>
  );
}
