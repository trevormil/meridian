'use client';

import { useState } from 'react';
import { broadcastMessages, SimulationError } from '@/lib/chain/broadcast';
import { Button } from '@/components/ui/Button';
import type { BroadcastResult } from 'bitbadges';

interface Props {
  label: string;
  build: () => unknown[] | Promise<unknown[]>;
  onSuccess?: (result: BroadcastResult) => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'yes' | 'no' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

type Phase = 'idle' | 'simulating' | 'signing' | 'done';

export function TxButton({ label, build, onSuccess, disabled, variant = 'primary', size = 'md' }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const loading = phase === 'simulating' || phase === 'signing';

  async function run() {
    setError(null);
    setSimError(null);
    setTxHash(null);
    try {
      const msgs = await build();
      if (!msgs.length) {
        setError('Nothing to broadcast');
        return;
      }
      setPhase('simulating');
      const result = await broadcastMessages(msgs);
      setPhase('done');
      if (!result.success) {
        setError(result.error ?? `tx failed (code ${result.code})`);
        return;
      }
      setTxHash(result.txHash);
      onSuccess?.(result);
    } catch (e) {
      if (e instanceof SimulationError) {
        // Loud surface — Keplr was never prompted, user should fix the input
        // and try again instead of signing a doomed tx.
        setSimError(e.message);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setPhase((p) => (p === 'simulating' || p === 'signing' ? 'idle' : p));
    }
  }

  const btnLabel =
    phase === 'simulating' ? 'Simulating…' :
    phase === 'signing' ? 'Awaiting signature…' :
    label;

  return (
    <div className="flex flex-col gap-1.5">
      <Button onClick={run} disabled={disabled || loading} loading={loading} variant={variant} size={size}>
        {btnLabel}
      </Button>
      {simError && (
        <div className="rounded-md border border-no/40 bg-no/10 px-3 py-2 text-xs text-no">
          <div className="font-semibold">Simulation failed — tx not signed</div>
          <div className="mt-0.5 text-no/80">{simError}</div>
        </div>
      )}
      {error && !simError && (
        <span className="text-xs text-no">{error}</span>
      )}
      {txHash && <span className="text-xs text-yes">✓ {txHash.slice(0, 16)}…</span>}
    </div>
  );
}
