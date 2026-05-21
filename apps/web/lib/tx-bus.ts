'use client';

/**
 * In-process event bus for tx confirmations. broadcastMessages emits here
 * AFTER the tx is committed (Cosmos: tx receipt found; EVM: eth_getTransactionReceipt
 * status=0x1). UI components that depend on chain-direct queries (bank balance,
 * YES/NO per-market balance) subscribe via `useRefreshOnTx` and re-fetch when
 * the version bumps.
 *
 * Why a bus instead of refetching inside broadcastMessages: the broadcasting
 * component (the TxButton) doesn't know what OTHER on-screen components need
 * to refresh. The bus lets every interested consumer subscribe independently.
 */

import { useEffect, useState } from 'react';

type Listener = (txHash: string) => void;

class TxBus {
  private listeners = new Set<Listener>();
  /** Monotonic counter — bumped on every confirmation. Used by useRefreshOnTx
   *  as a dependency value so React effects re-run. */
  private _version = 0;

  emit(txHash: string): void {
    this._version++;
    for (const fn of this.listeners) {
      try {
        fn(txHash);
      } catch (e) {
        console.error('[tx-bus] listener threw:', e);
      }
    }
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  get version(): number {
    return this._version;
  }
}

export const txBus = new TxBus();

/**
 * Re-runs `fn` whenever any tx confirms (after `deps` change). Use this for
 * any chain-direct query that should auto-refresh post-tx — bank balances,
 * per-market YES/NO balances, anything not flowing through the aggregator's
 * realtime channels.
 *
 * The bus tick is added to the dependency array internally, so `fn` is called
 * on mount AND on every tx confirm.
 */
export function useRefreshOnTx(fn: () => void | Promise<void>, deps: React.DependencyList): void {
  const [version, setVersion] = useState(0);
  useEffect(() => txBus.on(() => setVersion((v) => v + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void fn();
  }, [...deps, version]);
}
