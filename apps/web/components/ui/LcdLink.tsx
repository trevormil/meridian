import type { ReactNode } from 'react';

/**
 * Small external link to the chain's own LCD (Cosmos REST). The canonical
 * "verify it on-chain" affordance on the devnet, where public explorers can't
 * resolve this chain's state.
 */
export function LcdLink({
  href,
  children = 'on-chain',
  title = 'View on the chain LCD (Cosmos REST)',
}: {
  href: string;
  children?: ReactNode;
  title?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={title}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wider text-muted transition-colors hover:text-gold-bright"
    >
      {children}
      <span aria-hidden>↗</span>
    </a>
  );
}
