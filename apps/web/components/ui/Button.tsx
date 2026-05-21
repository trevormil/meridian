'use client';

import { clsx } from 'clsx';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

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
    'bg-accent text-white hover:bg-blue-500 shadow-[0_4px_16px_-4px_rgba(59,130,246,0.5)] hover:shadow-[0_4px_20px_-4px_rgba(59,130,246,0.7)]',
  secondary: 'bg-panel-2 border border-border text-ink hover:border-border-hi hover:bg-border/30',
  ghost: 'text-muted hover:text-ink hover:bg-panel-2',
  yes: 'bg-yes-gradient text-yes border border-yes/40 hover:border-yes/70 hover:bg-yes/15',
  no: 'bg-no-gradient text-no border border-no/40 hover:border-no/70 hover:bg-no/15',
  danger: 'bg-no text-white hover:bg-red-500 shadow-[0_4px_16px_-4px_rgba(239,68,68,0.5)]',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
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
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        'active:scale-[0.98]',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="flex items-center gap-1.5">
          <Spinner /> <span>…</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
