'use client';

import { clsx } from 'clsx';

interface Tab {
  key: string;
  label: string;
  hidden?: boolean;
}

interface Props {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}

export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={clsx(
              'relative px-4 py-2 text-sm font-medium transition-colors',
              active === t.key
                ? 'text-ink'
                : 'text-muted hover:text-ink',
            )}
          >
            {t.label}
            {active === t.key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
            )}
          </button>
        ))}
    </div>
  );
}
