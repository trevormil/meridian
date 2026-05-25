'use client';

import { useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { usePolling } from '@/lib/usePolling';
import { getChainLogs } from '@/lib/chain/explorer';

const LEVEL_COLOR: Record<string, string> = {
  INF: 'text-yes', WRN: 'text-amber', WARN: 'text-amber',
  ERR: 'text-no', ERRO: 'text-no', FTL: 'text-no', PNC: 'text-no', DBG: 'text-faint',
};

/** Render one zerolog console line ("<time> <LVL> <msg> key=value …") with
 *  light, XSS-safe syntax coloring (React nodes, never dangerouslySetInnerHTML). */
function LogLine({ line }: { line: string }) {
  const m = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?\s?[AP]M)?\s*([A-Z]{3,4})?\s*(.*)$/s);
  const time = m?.[1] ?? '';
  const lvl = m?.[2] ?? '';
  const rest = m?.[3] ?? line;
  const lvlColor = LEVEL_COLOR[lvl] ?? 'text-ink-dim';

  return (
    <div className="whitespace-pre-wrap break-all py-px">
      {time && <span className="text-faint">{time} </span>}
      {lvl && <span className={`font-semibold ${lvlColor}`}>{lvl} </span>}
      {rest.split(/(\s+)/).map((tok, i) => {
        const kv = tok.match(/^([a-zA-Z_][\w.]*)=(.*)$/s);
        if (!kv) return <span key={i} className="text-ink">{tok}</span>;
        return (
          <span key={i}>
            <span className="text-gold/70">{kv[1]}</span>
            <span className="text-faint">=</span>
            <span className="text-ink-dim">{kv[2]}</span>
          </span>
        );
      })}
    </div>
  );
}

export function NodeLogs() {
  const { data } = usePolling(() => getChainLogs(200), 3000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stuckToBottom = useRef(true);

  // Auto-scroll to the newest line, but only if the user hasn't scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stuckToBottom.current) el.scrollTop = el.scrollHeight;
  }, [data]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stuckToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const mounted = data?.mounted;
  const lines = data?.lines ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Node logs · journalctl</CardTitle>
        {mounted && (
          <span className="flex items-center gap-1.5 text-[11px] text-yes">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yes" /> live
          </span>
        )}
      </CardHeader>
      {mounted === false ? (
        <p className="rounded-lg border border-dashed border-border bg-bg/40 px-4 py-6 text-center text-xs text-muted">
          Node-log streaming isn't enabled on this deployment yet. Once the host ships
          <code className="mx-1 text-ink-dim">bitbadgeschain</code> journalctl to the mounted log file, the live
          tail appears here.
        </p>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-[40rem] overflow-auto rounded-lg border border-border bg-bg-deep p-3 font-mono text-[11px] leading-relaxed text-ink-dim"
        >
          {lines.length === 0 ? (
            <span className="text-faint">…</span>
          ) : (
            lines.map((l, i) => <LogLine key={i} line={l} />)
          )}
        </div>
      )}
    </Card>
  );
}
