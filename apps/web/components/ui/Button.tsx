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

// Clay buttons: puffy pill-ish blocks that physically press down on click
// (base shadow shrinks + button translates toward the surface).
const variantStyles: Record<Variant, string> = {
  primary:
    'bg-gold-gradient text-bg shadow-clay-gold hover:brightness-105 active:shadow-clay-gold-pressed',
  secondary:
    'bg-panel-2 text-ink shadow-clay-sm hover:text-gold-bright active:shadow-clay-pressed',
  ghost: 'text-muted hover:text-gold-bright hover:bg-panel-2 rounded-clay-sm',
  yes:
    'bg-yes-gradient text-yes-bright shadow-clay-sm hover:brightness-110 active:shadow-clay-pressed',
  no:
    'bg-no-gradient text-no-bright shadow-clay-sm hover:brightness-110 active:shadow-clay-pressed',
  danger:
    'bg-no text-ink shadow-clay-sm hover:bg-no-bright active:shadow-clay-pressed',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-9 px-4 text-[11px] tracking-[0.1em]',
  md: 'h-11 px-6 text-xs tracking-[0.12em]',
  lg: 'h-12 px-8 text-sm tracking-[0.12em]',
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
        // Rounded clay pills, semibold (Baloo). Press = translate down +
        // shrink the base shadow, so the button physically depresses.
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold uppercase transition-all duration-100',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
        'active:translate-y-1',
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
