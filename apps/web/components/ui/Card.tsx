import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Render with gradient + lift shadow for hero panels. */
  variant?: 'flat' | 'raised' | 'hero';
  /** Subtle accent border tint. */
  accent?: 'yes' | 'no' | 'accent' | null;
}

const variants = {
  flat: 'bg-panel border-border',
  raised: 'bg-panel border-border shadow-soft',
  hero: 'bg-panel bg-panel-gradient border-border-hi shadow-lift',
};

const accents = {
  yes: 'border-yes/30 shadow-[0_0_0_1px_rgba(34,197,94,0.1)]',
  no: 'border-no/30 shadow-[0_0_0_1px_rgba(239,68,68,0.1)]',
  accent: 'border-accent/30 shadow-[0_0_0_1px_rgba(59,130,246,0.1)]',
};

export function Card({ className, variant = 'raised', accent, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border p-5 transition-colors',
        variants[variant],
        accent && accents[accent],
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('mb-4 flex items-center justify-between', className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={clsx('text-xs font-semibold uppercase tracking-[0.14em] text-muted', className)}
      {...rest}
    />
  );
}
