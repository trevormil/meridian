'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { env } from '@/lib/env';
import { txBus } from '@/lib/tx-bus';

type ToastKind = 'success' | 'error' | 'pending' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  /** EVM tx hash (0x..) or Cosmos hash (UPPERHEX). Renders an explorer link. */
  txHash?: string;
  /** ms before auto-dismiss. 0 to require manual dismiss. */
  ttl?: number;
}

interface ToastApi {
  show: (t: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((arr) => arr.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      const ttl = t.ttl ?? (t.kind === 'error' ? 8000 : 4000);
      setToasts((arr) => [...arr, { id, ...t }]);
      if (ttl > 0) setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss],
  );

  // Auto-surface every successful tx as a toast. Components can still call
  // show() directly for custom messages, but this catches the common case
  // (deposit, redeem, intent, vote, faucet) without per-panel wiring.
  useEffect(() => {
    return txBus.on((txHash) => {
      show({ kind: 'success', title: 'Tx confirmed', txHash, ttl: 3500 });
    });
  }, [show]);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* Mobile: span both gutters (left-4 right-4) so a max-w-sm card can't
          overflow a 375px screen. Desktop: pin to the right at max-w-sm. */}
      <div className="pointer-events-none fixed inset-x-4 top-16 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:top-20 sm:w-full sm:max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast: t, onClose }: { toast: Toast; onClose: () => void }) {
  // Solid fills (no opaque-tint trick) so the toast pops over content. Each
  // tone gets a 2px accent strip on the left edge — same vocabulary as the
  // card-accent pattern.
  const tone = {
    success: 'bg-panel border-yes/60 border-l-yes',
    error: 'bg-panel border-no/60 border-l-no',
    pending: 'bg-panel border-gold/60 border-l-gold',
    info: 'bg-panel border-border-hi border-l-ink-dim',
  }[t.kind];
  const iconColor = {
    success: 'text-yes-bright',
    error: 'text-no-bright',
    pending: 'text-gold-bright',
    info: 'text-ink-dim',
  }[t.kind];
  const icon = { success: '✓', error: '✕', pending: '◐', info: '·' }[t.kind];
  return (
    <div
      role="status"
      className={clsx(
        'pointer-events-auto flex items-start gap-3 rounded border border-l-2 px-4 py-3 shadow-lift animate-slide-up backdrop-blur-md',
        tone,
      )}
    >
      <span className={clsx('mt-[2px] text-base leading-none', iconColor)} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight text-ink">{t.title}</div>
        {t.detail && (
          <div className="mt-1 text-xs leading-snug text-ink-dim">{t.detail}</div>
        )}
        {t.txHash && <TxHashLink hash={t.txHash} />}
      </div>
      <button
        onClick={onClose}
        className="text-base leading-none text-muted transition-colors hover:text-ink"
        aria-label="dismiss"
      >
        ×
      </button>
    </div>
  );
}

function TxHashLink({ hash }: { hash: string }) {
  // No explorer wired in dev; render the truncated hash, click-to-copy.
  const short = hash.startsWith('0x') ? `${hash.slice(0, 10)}…${hash.slice(-4)}` : `${hash.slice(0, 12)}…`;
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(hash);
        } catch {
          // ignore
        }
      }}
      title={`Copy ${hash}`}
      className="mt-1 inline-block font-mono text-[10px] opacity-70 hover:opacity-100"
    >
      tx {short}
    </button>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used within ToastProvider');
  return v;
}

// Re-export env-aware coin symbol for toast bodies that mention it.
export const _SYM = env.usdcSymbol;
