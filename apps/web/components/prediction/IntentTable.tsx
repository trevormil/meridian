'use client';

import { clsx } from 'clsx';
import { TxButton } from '@/components/tx/TxButton';
import { useWallet } from '@/contexts/WalletContext';
import type { IntentDto } from '@/lib/aggregator';
import { shortAddr } from '@/lib/format';
import { env } from '@/lib/env';
import { ExpiryCountdown } from './ExpiryCountdown';
import { buildCancelMsg, buildFillIntentMsg } from '@/lib/prediction-market/intents';
import { CoinDisplay } from '@/components/ui/CoinDisplay';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { Empty } from '@/components/ui/Empty';

interface ParsedRow {
  intent: IntentDto;
  payDenom: string;
  payAmount: bigint;
  receiveDenom: string;
  receiveAmount: bigint;
  isPredictionMarket: boolean;
  predSide: 'yes' | 'no' | null;
  rateLabel: string;
}

export function parseRow(intent: IntentDto): ParsedRow | null {
  if (!intent.payDenom || !intent.receiveDenom) return null;
  const payAmount = BigInt(intent.payAmount ?? '0');
  const receiveAmount = BigInt(intent.receiveAmount ?? '0');
  const isPM = intent.payDenom.startsWith('badgeslp:') || intent.receiveDenom.startsWith('badgeslp:');
  let predSide: 'yes' | 'no' | null = null;
  let rateLabel = '—';
  if (isPM) {
    const tokenDenom = intent.payDenom.startsWith('badgeslp:') ? intent.payDenom : intent.receiveDenom;
    predSide = tokenDenom.endsWith(':uyes') ? 'yes' : tokenDenom.endsWith(':uno') ? 'no' : null;
    const tokenAmt = intent.payDenom.startsWith('badgeslp:') ? Number(payAmount) : Number(receiveAmount);
    const coinAmt = intent.payDenom.startsWith('badgeslp:') ? Number(receiveAmount) : Number(payAmount);
    if (tokenAmt > 0) rateLabel = `${((coinAmt / tokenAmt) * 100).toFixed(1)}%`;
  } else if (Number(payAmount) > 0) {
    rateLabel = (Number(receiveAmount) / Number(payAmount)).toFixed(4);
  }
  return {
    intent,
    payDenom: intent.payDenom,
    payAmount,
    receiveDenom: intent.receiveDenom,
    receiveAmount,
    isPredictionMarket: isPM,
    predSide,
    rateLabel,
  };
}

function statusText(intent: IntentDto): { text: string; color: string } {
  if (intent.used) return { text: 'Filled', color: 'text-muted' };
  if (intent.isPending) return { text: 'Pending', color: 'text-accent' };
  if (intent.isExpired) return { text: 'Expired', color: 'text-no' };
  if (intent.isActive) return { text: 'Active', color: 'text-yes' };
  return { text: 'Inactive', color: 'text-muted' };
}

interface Props {
  rows: IntentDto[];
  collectionId: string;
  isMy: boolean;
  onTx: () => void;
}

export function IntentTable({ rows, collectionId, isMy, onTx }: Props) {
  if (rows.length === 0) {
    return <Empty title="No orders" description={isMy ? 'You have no orders on this market.' : 'No open orders right now.'} />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-panel">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-panel-2/50 text-left text-[10px] uppercase tracking-[0.14em] text-muted">
            <Th>{isMy ? 'You send' : 'You pay'}</Th>
            <Th className="w-8" />
            <Th>You receive</Th>
            <Th>Rate</Th>
            <Th>Expiry</Th>
            {isMy && <Th>Status</Th>}
            <Th className="text-right">Action</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((intent) => {
            const p = parseRow(intent);
            if (!p) return null;
            return <Row key={`${intent.approvalLevel}:${intent.approvalId}`} parsed={p} collectionId={collectionId} isMy={isMy} onTx={onTx} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={clsx('px-4 py-3 font-semibold', className)}>{children}</th>;
}

function Row({ parsed, collectionId, isMy, onTx }: { parsed: ParsedRow; collectionId: string; isMy: boolean; onTx: () => void }) {
  const { address } = useWallet();
  const i = parsed.intent;
  const isMine = address === i.approverAddress;
  const status = statusText(i);
  const dimmed = isMy && (i.used || i.isExpired);

  const payDenom = isMy ? parsed.payDenom : parsed.receiveDenom;
  const payAmount = isMy ? parsed.payAmount : parsed.receiveAmount;
  const recvDenom = isMy ? parsed.receiveDenom : parsed.payDenom;
  const recvAmount = isMy ? parsed.receiveAmount : parsed.payAmount;

  const sameCollectionSwap =
    parsed.isPredictionMarket && parsed.payDenom.startsWith('badgeslp:') && parsed.receiveDenom.startsWith('badgeslp:');

  return (
    <tr className={clsx('border-b border-border/40 last:border-b-0 transition-colors hover:bg-panel-2/30', dimmed && 'opacity-50')}>
      <td className="px-4 py-3">
        <CoinDisplay denom={payDenom} amount={payAmount} size="sm" mono />
      </td>
      <td className="px-2 py-3 text-center text-muted">→</td>
      <td className="px-4 py-3">
        <CoinDisplay denom={recvDenom} amount={recvAmount} size="sm" mono />
      </td>
      <td className="px-4 py-3 text-xs tabular-nums">
        {parsed.predSide ? (
          <span className={clsx(
            'rounded px-1.5 py-0.5 font-semibold',
            parsed.predSide === 'yes' ? 'bg-yes/15 text-yes' : 'bg-no/15 text-no',
          )}>
            {parsed.predSide.toUpperCase()} {parsed.rateLabel}
          </span>
        ) : (
          <span className="text-muted">{parsed.rateLabel}</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted">
        <ExpiryCountdown startMs={i.transferTimes.start} endMs={i.transferTimes.end} />
      </td>
      {isMy && (
        <td className="px-4 py-3 text-xs">
          <span className={clsx('font-medium', status.color)}>{status.text}</span>
        </td>
      )}
      <td className="px-4 py-3 text-right">
        {isMine ? (
          isMy ? (
            i.used ? (
              <span className="text-xs text-muted">—</span>
            ) : (
              // Allow cancel even on expired rows: chain auto-purges via
              // allowPurgeIfExpired, but if the row is still indexed we let
              // the user clean it up manually.
              <TxButton
                label={i.isExpired ? 'Purge' : 'Cancel'}
                variant="secondary"
                size="sm"
                build={() =>
                  address
                    ? [buildCancelMsg({ address, collectionId, approvalId: i.approvalId, approvalLevel: i.approvalLevel })]
                    : []
                }
                onSuccess={onTx}
              />
            )
          ) : (
            <span className="text-xs text-muted">Yours</span>
          )
        ) : address ? (
          sameCollectionSwap ? (
            <span className="text-xs text-no">Unsupported</span>
          ) : (
            <TxButton
              label="Swap"
              variant={parsed.predSide === 'no' ? 'no' : 'yes'}
              size="sm"
              build={() => {
                if (!address) return [];
                const tokenId = parsed.predSide === 'no' ? 2 : 1;
                const tokenAmount = i.approvalLevel === 'outgoing' ? parsed.payAmount : parsed.receiveAmount;
                return [
                  buildFillIntentMsg({
                    filler: address,
                    ownerAddress: i.approverAddress,
                    collectionId,
                    approvalId: i.approvalId,
                    approvalLevel: i.approvalLevel,
                    tokenId,
                    tokenAmount,
                  }),
                ];
              }}
              onSuccess={onTx}
            />
          )
        ) : (
          <span className="text-[10px] text-muted">Connect to fill</span>
        )}
      </td>
    </tr>
  );
}

interface GroupedProps {
  rows: IntentDto[];
  collectionId: string;
  onTx: () => void;
}

interface Group {
  label: string;
  payDenom: string;
  receiveDenom: string;
  rows: IntentDto[];
}

export function GroupedIntents({ rows, collectionId, onTx }: GroupedProps) {
  const yesDenom = `badgeslp:${collectionId}:uyes`;
  const noDenom = `badgeslp:${collectionId}:uno`;
  const usdcDenom = env.usdcDenom;
  const pairs = [
    { pay: usdcDenom, receive: yesDenom, label: 'Buy YES' },
    { pay: usdcDenom, receive: noDenom, label: 'Buy NO' },
    { pay: yesDenom, receive: usdcDenom, label: 'Sell YES' },
    { pay: noDenom, receive: usdcDenom, label: 'Sell NO' },
  ];
  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const pair of pairs) {
    const matching = rows.filter(
      (r) => r.payDenom === pair.pay && r.receiveDenom === pair.receive && !seen.has(`${r.approvalLevel}:${r.approvalId}`),
    );
    if (matching.length > 0) {
      matching.forEach((r) => seen.add(`${r.approvalLevel}:${r.approvalId}`));
      matching.sort((a, b) => {
        const pa = parseRow(a)!;
        const pb = parseRow(b)!;
        const ratioA = Number(pa.receiveAmount) / Math.max(Number(pa.payAmount), 1);
        const ratioB = Number(pb.receiveAmount) / Math.max(Number(pb.payAmount), 1);
        return ratioB - ratioA;
      });
      groups.push({ label: pair.label, payDenom: pair.pay, receiveDenom: pair.receive, rows: matching });
    }
  }
  const other = rows.filter((r) => !seen.has(`${r.approvalLevel}:${r.approvalId}`));
  if (other.length > 0) groups.push({ label: 'Other', payDenom: '', receiveDenom: '', rows: other });

  if (groups.length === 0) {
    return <Empty title="Empty order book" description="No one's placed an order yet. Be the first." />;
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-3 flex items-center gap-3">
            {g.payDenom && <CoinIcon denom={g.payDenom} size="sm" />}
            <span className="text-sm font-semibold text-ink">{g.label}</span>
            {g.receiveDenom && (
              <>
                <span className="text-muted">→</span>
                <CoinIcon denom={g.receiveDenom} size="sm" />
              </>
            )}
            <span className="ml-2 rounded-full bg-panel-2 px-2 py-0.5 text-[10px] font-medium text-muted">
              {g.rows.length}
            </span>
          </div>
          <IntentTable rows={g.rows} collectionId={collectionId} isMy={false} onTx={onTx} />
        </div>
      ))}
    </div>
  );
}
