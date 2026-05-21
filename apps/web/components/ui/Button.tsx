'use client';

import { clsx } from 'clsx';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

/**
 * Button system tuned to the Meridian palette.
 *
 *   primary  — solid gold gradient, used for the single highest-stakes action
 *              per view (Place order, Resolve, Claim, etc). One per panel.
 *   secondary— hairline outline on bg-panel-2, the default chrome action
 *   ghost    — text-only, used in dense menus
 *   yes      — champagne tint (logo's gold), for YES-side trades
 *   no       — crimson tint (logo's heat), for NO-side trades + cancel
 *   danger   — solid crimson, only for irreversible destructive ops
 *
 * No bubble-rounding. Compact horizontal rhythm. Tabular numerals everywhere.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'yes' | 'no' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-gold-gradient text-bg shadow-[0_4px_20px_-6px_rgba(232,177,74,0.45)] hover:shadow-[0_6px_28px_-6px_rgba(232,177,74,0.65)] hover:brightness-110',
  secondary:
    'bg-panel-2 border border-border text-ink hover:border-gold/40 hover:bg-panel-3 hover:text-gold-bright',
  ghost: 'text-muted hover:text-gold-bright hover:bg-panel-2',
  yes:
    'bg-yes-gradient text-yes-bright border border-yes/40 hover:border-yes/80 hover:bg-yes/20',
  no:
    'bg-no-gradient text-no-bright border border-no/40 hover:border-no/80 hover:bg-no/20',
  danger:
    'bg-no text-ink hover:bg-no-bright shadow-[0_4px_20px_-6px_rgba(217,56,38,0.55)]',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-[11px] tracking-[0.12em]',
  md: 'h-10 px-5 text-xs tracking-[0.14em]',
  lg: 'h-12 px-7 text-sm tracking-[0.14em]',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        // Sharp corners — no pillow rounding. Uppercase semibold so buttons
        // read as deliberate actions, not bubbles.
        'inline-flex items-center justify-center gap-2 rounded font-semibold uppercase transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100',
        'active:translate-y-px',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
