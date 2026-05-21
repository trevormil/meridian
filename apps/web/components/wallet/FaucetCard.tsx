'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { env } from '@/lib/env';
import { shortAddr } from '@/lib/format';

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
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

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
    setResult(null);
    try {
      const r = await fetch(`${env.aggregatorUrl}/api/v0/faucet/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const j = await r.json();
      if (j.ok) {
        setResult({
          ok: true,
          msg: `+${perClaimDisplay} ${env.usdcSymbol} sent — tx ${String(j.txHash).slice(0, 12)}…`,
        });
      } else {
        setResult({ ok: false, msg: j.detail ?? j.error ?? 'faucet failed' });
      }
      await refresh();
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message });
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
        <p className="text-sm text-muted">
          Tap {perClaimDisplay} {env.usdcSymbol} from the dev faucet to your connected wallet.
        </p>
        <div className="flex items-center justify-between rounded border border-border bg-bg/60 p-3 text-xs">
          <div>
            <div className="text-muted">Faucet balance</div>
            <div className="font-mono text-ink">
              {balanceDisplay} {env.usdcSymbol}{' '}
              <span className="text-muted">({status.claimsLeft ?? 0} claims left)</span>
            </div>
          </div>
          {status.address && (
            <div className="text-right">
              <div className="text-muted">From</div>
              <div className="font-mono text-[10px]">{shortAddr(status.address)}</div>
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
        {result && (
          <div
            className={`rounded border p-2 text-xs ${
              result.ok ? 'border-yes/40 bg-yes/10 text-yes' : 'border-no/40 bg-no/10 text-no'
            }`}
          >
            {result.msg}
          </div>
        )}
      </div>
    </Card>
  );
}
