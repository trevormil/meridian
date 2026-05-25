'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Empty';
import type { BlockSummary } from '@/lib/chain/explorer';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 1000) return 'now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}

export function RecentBlocks({ blocks }: { blocks: BlockSummary[] | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent blocks</CardTitle>
        <span className="text-[11px] text-muted">{blocks ? `${blocks.length} latest` : ''}</span>
      </CardHeader>
      {!blocks ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {blocks.map((b, i) => (
            <li
              key={b.height}
              className={`flex items-center justify-between gap-3 py-2 text-sm ${i === 0 ? 'animate-slide-up' : ''}`}
            >
              <span className="flex items-center gap-2.5">
                <span className="font-mono font-semibold text-gold-bright">#{b.height.toLocaleString()}</span>
                <span className="rounded border border-yes/40 bg-yes/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yes">
                  ✓ {b.signatures} sig
                </span>
              </span>
              <span className="flex items-center gap-3 font-mono text-xs text-muted">
                <span>{b.numTxs} tx{b.numTxs === 1 ? '' : 's'}</span>
                <span className="text-faint">{timeAgo(b.time)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
