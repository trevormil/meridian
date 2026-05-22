'use client';

import { clsx } from 'clsx';
import { type InputHTMLAttributes, forwardRef } from 'react';

/**
 * Input field — clay "recessed" treatment: carved into the surface via an
 * inset shadow (no border), soft rounded corners, gold focus glow. Number
 * inputs pick up tabular mono figures.
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
        'h-11 w-full rounded-clay-sm bg-bg-deep px-4 text-sm text-ink shadow-clay-inset transition-shadow',
        'placeholder:text-faint',
        'focus:outline-none focus:shadow-[inset_0_3px_7px_rgba(0,0,0,0.55),0_0_0_3px_rgba(232,177,74,0.25)]',
        'disabled:opacity-50',
        isNumeric && 'font-mono tracking-tight',
        className,
      )}
      {...rest}
    />
  );
});
