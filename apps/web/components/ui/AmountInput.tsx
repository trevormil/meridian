'use client';

import { clsx } from 'clsx';
import { type InputHTMLAttributes, forwardRef } from 'react';
import { CoinIcon } from './CoinIcon';
import { coinInfo, formatAmount } from '@/lib/coins';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  denom: string | null | undefined;
  /** Balance in base units; if present, a Max button + balance line render. */
  balance?: bigint | null;
  /** Called with display-amount when Max is pressed. */
  onMax?: (displayAmount: string) => void;
  /** Optional label above input. */
  label?: string;
  error?: string;
}

export const AmountInput = forwardRef<HTMLInputElement, Props>(function AmountInput(
  { denom, balance, onMax, label, error, className, ...rest },
  ref,
) {
  const info = coinInfo(denom);
  const balanceDisplay = balance !== null && balance !== undefined ? formatAmount(balance, info.decimals) : null;
  return (
    <div className="space-y-1">
      {(label || balanceDisplay !== null) && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{label}</span>
          {balanceDisplay !== null && (
            <button
              type="button"
              onClick={() => onMax?.(balanceDisplay)}
              className="hover:text-accent"
              disabled={!onMax}
            >
              Balance: <span className="font-mono">{balanceDisplay}</span>
            </button>
          )}
        </div>
      )}
      <div className={clsx(
        'flex items-center gap-2 rounded-lg border bg-bg pl-3 pr-2 transition-colors',
        error ? 'border-no' : 'border-border focus-within:border-accent',
      )}>
        <input
          ref={ref}
          inputMode="decimal"
          type="number"
          step="any"
          className={clsx(
            'h-12 flex-1 bg-transparent text-lg font-mono tabular-nums text-ink placeholder:text-muted/60 focus:outline-none',
            className,
          )}
          placeholder="0.00"
          {...rest}
        />
        <div className="flex items-center gap-1.5 rounded-md bg-panel px-2 py-1">
          <CoinIcon denom={denom} size="sm" />
          <span className="text-sm font-semibold">{info.symbol}</span>
        </div>
        {onMax && balance !== undefined && balance !== null && (
          <button
            type="button"
            onClick={() => onMax(balanceDisplay ?? '0')}
            className="rounded bg-accent/10 px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
          >
            MAX
          </button>
        )}
      </div>
      {error && <p className="text-xs text-no">{error}</p>}
    </div>
  );
});
