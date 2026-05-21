import { clsx } from 'clsx';
import { coinInfo, formatAmount } from '@/lib/coins';
import { CoinIcon } from './CoinIcon';

interface Props {
  denom: string | null | undefined;
  amount: bigint | string | number;
  /** Show coin icon to the left. Default true. */
  icon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Override the symbol color. Defaults to neutral ink. */
  mono?: boolean;
}

const sizes = {
  sm: { text: 'text-xs', sym: 'text-[10px]', icon: 'xs' as const },
  md: { text: 'text-sm', sym: 'text-xs', icon: 'sm' as const },
  lg: { text: 'text-2xl font-semibold', sym: 'text-sm', icon: 'md' as const },
};

/**
 * Coin amount + symbol + icon. Use everywhere we display a balance, deposit,
 * or order amount. Mirrors the FE's CoinDisplay aesthetic but trimmed for
 * the standalone app's denoms.
 */
export function CoinDisplay({ denom, amount, icon = true, size = 'md', className, mono }: Props) {
  const info = coinInfo(denom);
  const value = formatAmount(amount, info.decimals);
  const s = sizes[size];
  return (
    <span className={clsx('inline-flex items-center gap-1.5', className)}>
      {icon && <CoinIcon denom={denom} size={s.icon} />}
      <span className={clsx(s.text, mono && 'font-mono tabular-nums')}>{value}</span>
      <span
        className={clsx(
          s.sym,
          'font-medium uppercase tracking-wider',
          info.accent === 'yes' ? 'text-yes' : info.accent === 'no' ? 'text-no' : 'text-muted',
        )}
      >
        {info.symbol}
      </span>
    </span>
  );
}
