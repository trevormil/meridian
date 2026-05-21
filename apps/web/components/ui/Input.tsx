'use client';

import { clsx } from 'clsx';
import { type InputHTMLAttributes, forwardRef } from 'react';

/**
 * Input field. Sharper corners than the previous design + gold focus ring.
 * Number inputs auto-pick up tabular figures via the global mono class.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type, ...rest },
  ref,
) {
  const isNumeric = type === 'number' || type === 'tel';
  return (
    <input
      ref={ref}
      type={type}
      className={clsx(
        'h-10 w-full rounded border border-border bg-bg-deep px-3 text-sm text-ink transition-colors',
        'placeholder:text-faint',
        'focus:border-gold/60 focus:bg-bg-deep focus:outline-none focus:shadow-[0_0_0_4px_rgba(232,177,74,0.10)]',
        'disabled:opacity-50',
        isNumeric && 'font-mono tracking-tight',
        className,
      )}
      {...rest}
    />
  );
});
