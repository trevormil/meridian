'use client';

import { clsx } from 'clsx';
import { type IntentDto } from '@/lib/aggregator';
import { env } from '@/lib/env';
import { CoinIcon } from '@/components/ui/CoinIcon';

/**
 * Exchange-style order book depth view. Two side-by-side ladders (YES / NO),
 * each split into asks (sells, top, red) and bids (buys, bottom, green) with
 * a midpoint spread row. Depth bars on each row scale to the largest level on
 * that side so visual heft tracks size.
 *
 * Data comes via the realtime `intents:{collectionId}` channel (already wired
 * upstream in IntentsPanel), so the bars retick in real time as the seeder
 * posts orders, users place + cancel, and the arb bot fills.
 */

interface Props {
  book: IntentDto[];
  collectionId: string;
}

interface Level {
  /** Implied probability (0..1). */
  price: number;
  /** Token base units summed across all intents at this price. */
  qty: bigint;
  /** Original intent rows so the user can hover for who/when. */
  rows: IntentDto[];
}

function classify(intent: IntentDto): { side: 'yes' | 'no'; kind: 'bid' | 'ask'; price: number; qty: bigint } | null {
  const pay = intent.payDenom ?? '';
  const recv = intent.receiveDenom ?? '';
  const payTok = pay.startsWith('badgeslp:');
  const recvTok = recv.startsWith('badgeslp:');
  if (payTok === recvTok) return null;
  const tokenAmtStr = payTok ? intent.payAmount : intent.receiveAmount;
  const coinAmtStr = payTok ? intent.receiveAmount : intent.payAmount;
  const tokenAmt = BigInt(tokenAmtStr ?? '0');
  const coinAmt = BigInt(coinAmtStr ?? '0');
  if (tokenAmt === 0n) return null;
  // price = coinAmount / tokenAmount, both in base units → ratio of decimals
  // is identical (both 6) so it normalizes cleanly.
  const price = Number(coinAmt) / Number(tokenAmt);
  const denom = payTok ? pay : recv;
  const side = denom.endsWith(':uyes') ? 'yes' : denom.endsWith(':uno') ? 'no' : null;
  if (!side) return null;
  // incoming = approval to RECEIVE tokens for USDC → that's a BUY of tokens (bid)
  // outgoing = approval to SEND tokens for USDC → SELL of tokens (ask)
  const kind = intent.approvalLevel === 'incoming' ? 'bid' : 'ask';
  return { side, kind, price, qty: tokenAmt };
}

function bucket(intents: IntentDto[]): {
  yesBids: Level[];
  yesAsks: Level[];
  noBids: Level[];
  noAsks: Level[];
} {
  const buckets: Record<string, Map<number, Level>> = {
    'yes-bid': new Map(),
    'yes-ask': new Map(),
    'no-bid': new Map(),
    'no-ask': new Map(),
  };
  for (const i of intents) {
    if (!i.isActive) continue;
    const c = classify(i);
    if (!c) continue;
    const key = `${c.side}-${c.kind}`;
    const priceKey = Math.round(c.price * 1000) / 1000;
    const existing = buckets[key].get(priceKey);
    if (existing) {
      existing.qty += c.qty;
      existing.rows.push(i);
    } else {
      buckets[key].set(priceKey, { price: priceKey, qty: c.qty, rows: [i] });
    }
  }
  // Bids (buys) sort high→low so the highest bid sits closest to the spread.
  // Asks (sells) sort low→high for the same reason.
  const asArr = (m: Map<number, Level>, dir: 'asc' | 'desc'): Level[] =>
    [...m.values()].sort((a, b) => (dir === 'asc' ? a.price - b.price : b.price - a.price));
  return {
    yesBids: asArr(buckets['yes-bid'], 'desc'),
    yesAsks: asArr(buckets['yes-ask'], 'asc'),
    noBids: asArr(buckets['no-bid'], 'desc'),
    noAsks: asArr(buckets['no-ask'], 'asc'),
  };
}

function maxQty(levels: Level[]): bigint {
  let m = 0n;
  for (const l of levels) if (l.qty > m) m = l.qty;
  return m === 0n ? 1n : m;
}

function fmtQty(q: bigint): string {
  // 6-decimal token base units. Show with up to 2 decimals.
  const whole = q / 1_000_000n;
  const frac = q % 1_000_000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '').slice(0, 2);
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(0)}¢`;
}

export function OrderBookDepth({ book, collectionId }: Props) {
  const { yesBids, yesAsks, noBids, noAsks } = bucket(book);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Side title="YES" bids={yesBids} asks={yesAsks} color="yes" />
      <Side title="NO" bids={noBids} asks={noAsks} color="no" />
    </div>
  );
}

function Side({
  title,
  bids,
  asks,
  color,
}: {
  title: string;
  bids: Level[];
  asks: Level[];
  color: 'yes' | 'no';
}) {
  const max = maxQty([...bids, ...asks]);
  // Show the best (innermost) 8 levels on each side so the ladder fits
  // without scroll. Asks descend (lowest at the bottom, just above the
  // spread row); bids descend from the spread row.
  const askRows = asks.slice(0, 8).reverse();
  const bidRows = bids.slice(0, 8);
  const bestAsk = asks[0];
  const bestBid = bids[0];
  const spread = bestAsk && bestBid ? bestAsk.price - bestBid.price : null;
  const mid = bestAsk && bestBid ? (bestAsk.price + bestBid.price) / 2 : null;

  const tone =
    color === 'yes'
      ? { tag: 'bg-yes/10 text-yes border-yes/30', bid: 'bg-yes/15', ask: 'bg-no/15', bidText: 'text-yes', askText: 'text-no' }
      : { tag: 'bg-no/10 text-no border-no/30', bid: 'bg-yes/15', ask: 'bg-no/15', bidText: 'text-yes', askText: 'text-no' };

  return (
    <div className="rounded-lg border border-border bg-panel-2/40">
      <div className={clsx('flex items-center justify-between border-b border-border px-3 py-2', tone.tag)}>
        <div className="flex items-center gap-2">
          <CoinIcon denom={`badgeslp:0:u${color}`} size="xs" />
          <span className="text-sm font-semibold uppercase tracking-wider">{title}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider opacity-70">depth</span>
      </div>
      <div className="px-3 py-2">
        <div className="mb-1 grid grid-cols-[1fr_auto] text-[10px] uppercase tracking-wider text-muted">
          <span>Price</span>
          <span className="text-right">Size</span>
        </div>

        {askRows.length === 0 && bidRows.length === 0 && (
          <div className="py-6 text-center text-xs text-muted">No orders</div>
        )}

        {askRows.map((l) => (
          <Row key={`ask-${l.price}`} level={l} max={max} variant="ask" />
        ))}

        {(bestAsk || bestBid) && (
          <div className="my-1.5 flex items-center justify-between rounded bg-panel-2/80 px-2 py-1 text-[11px]">
            <span className="text-muted">
              {mid != null ? `mid ${fmtPct(mid)}` : 'no mid'}
            </span>
            <span className={clsx('font-mono', spread !== null && spread > 0 ? 'text-muted' : 'text-yes')}>
              {spread !== null ? `spread ${(spread * 100).toFixed(1)}¢` : '—'}
            </span>
          </div>
        )}

        {bidRows.map((l) => (
          <Row key={`bid-${l.price}`} level={l} max={max} variant="bid" />
        ))}
      </div>
    </div>
  );
}

function Row({ level, max, variant }: { level: Level; max: bigint; variant: 'bid' | 'ask' }) {
  // Pct in 0..100 for the depth bar width. Float math is fine here — the
  // bars are visual only; aggregation already happened in bigint.
  const pct = Math.max(2, Math.min(100, Number((level.qty * 100n) / max)));
  const bar = variant === 'bid' ? 'bg-yes/25' : 'bg-no/25';
  const text = variant === 'bid' ? 'text-yes' : 'text-no';
  return (
    <div className="relative grid grid-cols-[1fr_auto] items-center px-2 py-[3px] text-xs">
      <div
        className={clsx('absolute inset-y-0 right-0', bar)}
        style={{ width: `${pct}%` }}
        aria-hidden
      />
      <span className={clsx('relative font-mono', text)}>{fmtPct(level.price)}</span>
      <span className="relative text-right font-mono text-ink">{fmtQty(level.qty)}</span>
    </div>
  );
}
