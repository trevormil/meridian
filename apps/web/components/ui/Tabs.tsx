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
    // Horizontally scrollable on mobile so 6 tabs never wrap or clip at 375px;
    // scrollbar hidden, momentum-swipeable. The bottom border spans the full
    // scroll width via the inline-flex min-width.
    <div className="no-scrollbar -mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1">
        {tabs
          .filter((t) => !t.hidden)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={clsx(
                'relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-2',
                active === t.key ? 'text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {t.label}
              {active === t.key && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
              )}
            </button>
          ))}
      </div>
    </div>
  );
}
