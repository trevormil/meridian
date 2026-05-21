'use client';

import { clsx } from 'clsx';
import { type InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={clsx(
        'h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-ink',
        'placeholder:text-muted focus:border-accent focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
});
