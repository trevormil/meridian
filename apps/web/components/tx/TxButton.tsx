'use client';

import { useState } from 'react';
import { broadcastMessages, SimulationError } from '@/lib/chain/broadcast';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toasts';
import type { BroadcastResult } from 'bitbadges';

interface Props {
  label: string;
  build: () => unknown[] | Promise<unknown[]>;
  onSuccess?: (result: BroadcastResult) => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'yes' | 'no' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

type Phase = 'idle' | 'simulating' | 'signing' | 'done';

/**
 * Tx button. All outcomes route through the toast system:
 *   - Simulation failure → red toast titled "Simulation failed" with chain reason
 *   - Broadcast / on-chain revert → red toast titled "Tx failed"
 *   - Success → green toast (auto-fired by tx-bus subscription in ToastProvider,
 *     so we don't need to push one here)
 *
 * The button label still cycles (Simulating… / Awaiting signature… / final label)
 * so the user sees in-progress state even before the toast lands.
 */
export function TxButton({
  label,
  build,
  onSuccess,
  disabled,
  variant = 'primary',
  size = 'md',
  fullWidth,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const toast = useToast();

  const loading = phase === 'simulating' || phase === 'signing';

  async function run() {
    try {
      const msgs = await build();
      if (!msgs.length) {
        toast.show({ kind: 'error', title: 'Nothing to broadcast', detail: 'Builder produced no messages.' });
        return;
      }
      setPhase('simulating');
      const result = await broadcastMessages(msgs);
      setPhase('done');
      if (!result.success) {
        toast.show({
          kind: 'error',
          title: 'Tx failed',
          detail: result.error ?? `code ${result.code}`,
        });
        return;
      }
      // Successful broadcast: tx-bus will fire a "Tx confirmed" toast once the
      // chain commits, so no manual show() here. onSuccess still fires for any
      // post-tx side effects the caller wires.
      onSuccess?.(result);
    } catch (e) {
      if (e instanceof SimulationError) {
        toast.show({
          kind: 'error',
          title: 'Simulation failed — tx not signed',
          detail: e.message,
          ttl: 10_000,
        });
      } else {
        toast.show({ kind: 'error', title: 'Tx error', detail: (e as Error).message, ttl: 8000 });
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
    <Button
      onClick={run}
      disabled={disabled || loading}
      loading={loading}
      variant={variant}
      size={size}
      fullWidth={fullWidth}
    >
      {btnLabel}
    </Button>
  );
}
