import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

/**
 * Card system — "clay" surfaces. Depth comes from puffy shadows (a solid base
 * offset + soft ambient blur + inset top highlight), not borders. Big soft
 * radii. Three density variants:
 *
 *   flat   — lighter clay (clay-sm), for nested/body content.
 *   raised — full clay puff. The default content panel.
 *   hero   — clay puff + warm gradient + larger radius, for the marquee panel.
 *
 * Optional `accent` strip on the left edge — gold / yes / no — for state.
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'flat' | 'raised' | 'hero';
  accent?: 'gold' | 'yes' | 'no' | null;
}

const variants = {
  flat: 'bg-panel rounded-clay-sm shadow-clay-sm',
  raised: 'bg-panel rounded-clay shadow-clay',
  hero: 'bg-panel bg-panel-gradient rounded-clay-lg shadow-clay',
};

const accents = {
  gold: 'border-l-gold/60 border-l-4',
  yes: 'border-l-yes/60 border-l-4',
  no: 'border-l-no/60 border-l-4',
};

export function Card({ className, variant = 'raised', accent, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        'p-6 transition-shadow',
        variants[variant],
        accent && accents[accent],
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('mb-5 flex items-center justify-between gap-3', className)}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={clsx(
        'text-[10px] font-semibold uppercase tracking-[0.18em] text-muted',
        className,
      )}
      {...rest}
    />
  );
}
