'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ChainOverview } from '@/lib/chain/explorer';

function shortBech(a: string): string {
  return a.length > 24 ? `${a.slice(0, 16)}…${a.slice(-6)}` : a;
}

export function ValidatorCard({ data }: { data: ChainOverview | null }) {
  const v = data?.validators?.[0] ?? null;
  const signed = data?.blocks?.filter((b) => b.signatures > 0).length ?? 0;
  const total = data?.blocks?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Validator</CardTitle>
        <span className="text-[11px] text-muted">{data ? `${data.validators.length} active` : ''}</span>
      </CardHeader>
      {v ? (
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-semibold uppercase tracking-[0.14em] text-muted">Voting power</span>
              <span className="font-mono text-ink">{v.powerPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-deep">
              <div className="h-full rounded-full bg-gold-bright transition-[width] duration-300" style={{ width: `${v.powerPct}%` }} />
            </div>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Consensus address</span>
            <p className="mt-1 break-all font-mono text-xs text-ink-dim">{shortBech(v.address)}</p>
          </div>
          <p className="rounded-lg border border-border bg-bg/40 px-3 py-2 text-[11px] leading-relaxed text-faint">
            Single-validator devnet — this node proposes and signs every block (✓ {signed}/{total} latest).
            Markets settle by a verifier <code className="text-ink-dim">MsgCastVote</code>, enforced in protocol.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">Validator set unavailable.</p>
      )}
    </Card>
  );
}
