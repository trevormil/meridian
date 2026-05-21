import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function Empty({ icon, title, description, action, className }: Props) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-panel/50 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="text-3xl text-muted">{icon}</div>}
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <Skeleton className="h-8 w-8 rounded-full" />
      <Skeleton className="h-4 flex-1" />
    </div>
  );
}
