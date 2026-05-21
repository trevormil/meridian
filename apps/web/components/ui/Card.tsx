import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

/**
 * Card system — three variants matched to information density:
 *
 *   flat   — bare bg-panel, hairline border. Use for body content + tables.
 *   raised — same but lifted with a subtle outer shadow. Use for the primary
 *            content panels on each page.
 *   hero   — bg with a warm gradient + bright hairline + lift. Use for the
 *            most important panel on the page (market detail header, settle).
 *
 * Optional `accent` strip on the left edge — gold / yes / no — for state.
 * Cards intentionally use a small `rounded` radius (4px) not the soft pillowy
 * rounded-2xl that's everywhere in AI-generated UIs.
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'flat' | 'raised' | 'hero';
  accent?: 'gold' | 'yes' | 'no' | null;
}

const variants = {
  flat: 'bg-panel border-border',
  raised: 'bg-panel border-border shadow-soft',
  hero: 'bg-panel bg-panel-gradient border-border-hi shadow-lift',
};

const accents = {
  gold: 'border-l-gold/60 border-l-2',
  yes: 'border-l-yes/60 border-l-2',
  no: 'border-l-no/60 border-l-2',
};

export function Card({ className, variant = 'raised', accent, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded border p-6 transition-colors',
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
