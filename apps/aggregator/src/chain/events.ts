import { env } from '../env.js';

/**
 * Parsed `usedApprovalDetails` event — emitted by the chain on every approved
 * token transfer. Includes the JSON-encoded balances + coinTransfers payload
 * so we can derive trade prices without re-walking the approval chain state.
 *
 * Matches the indexer's `handleEvent` parser in
 * bitbadges-indexer/src/poll.ts (where this contract is enforced).
 */
export interface UsedApprovalDetails {
  collectionId: string;
  from: string;
  to: string;
  initiatedBy: string;
  balances: Array<{ amount: string; tokenIds: Array<{ start: string; end: string }> }>;
  coinTransfers: Array<{ From: string; To: string; Amount: string; Denom: string; IsProtocolFee: boolean }>;
  approvalsUsed: Array<{ ApprovalId: string; ApprovalLevel: string; ApproverAddress: string; Version: string }>;
}

interface RawAttribute {
  key?: string | Uint8Array;
  value?: string | Uint8Array;
}

interface RawEvent {
  type: string;
  attributes?: RawAttribute[];
}

function attr(value: string | Uint8Array | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return new TextDecoder().decode(value);
}

function attrs(e: RawEvent): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of e.attributes ?? []) {
    out[attr(a.key)] = attr(a.value);
  }
  return out;
}

/**
 * Parse every `usedApprovalDetails` event (tokenization module) out of a
 * collection of chain events. Each parsed entry is one matched approval
 * within one MsgTransferTokens — a single intent fill is exactly one entry.
 */
export function parseUsedApprovalDetails(events: RawEvent[]): UsedApprovalDetails[] {
  const out: UsedApprovalDetails[] = [];
  for (const e of events ?? []) {
    if (e.type !== 'usedApprovalDetails') continue;
    const a = attrs(e);
    if (a.module !== 'tokenization') continue;
    if (!a.collectionId) continue;
    try {
      out.push({
        collectionId: a.collectionId,
        from: a.from ?? '',
        to: a.to ?? '',
        initiatedBy: a.initiatedBy ?? '',
        balances: JSON.parse(a.balances && a.balances !== 'null' ? a.balances : '[]'),
        coinTransfers: JSON.parse(a.coinTransfers && a.coinTransfers !== 'null' ? a.coinTransfers : '[]'),
        approvalsUsed: JSON.parse(a.approvalsUsed && a.approvalsUsed !== 'null' ? a.approvalsUsed : '[]'),
      });
    } catch {
      // malformed attributes — skip
    }
  }
  return out;
}

/**
 * ## Price formula (canonical, v1)
 *
 * Headline `yes_price` for a prediction market = **the implied YES probability
 * of the most recent fill**.
 *
 *   For a YES-token fill: `yes_price = coin_amount / token_amount`
 *   For a NO-token fill:  `yes_price = 1 - (coin_amount / token_amount)`
 *
 * Where:
 *   - `coin_amount` = sum of `coinTransfers[].Amount` with `IsProtocolFee=false`
 *   - `token_amount` = sum of `balances[].amount` from the same usedApprovalDetails
 *
 * Multi-token transfers (paired-mint, pair-redeem) return null — these aren't
 * trades and shouldn't move the headline price.
 *
 * Stored candle: same value goes into `price_history` per timeframe bucket
 * (10m / 1h / 1d). Within a bucket, OHLC tracks open/high/low/close where
 * `close` is the latest fill price observed in that bucket.
 *
 * Equivalent to bitbadges-indexer's `getDetailsFromDoc` (handleTransfers.ts):
 *   price = totalAmountPaid / volume    // YES-side
 * with NO-side inverted to keep the chart in a single YES-probability series.
 */
export function impliedYesPrice(event: UsedApprovalDetails): number | null {
  // Sum token amount + identify which side (YES=1, NO=2) moved.
  let tokenAmount = 0n;
  let sawYes = false;
  let sawNo = false;
  for (const b of event.balances) {
    tokenAmount += BigInt(b.amount);
    for (const r of b.tokenIds ?? []) {
      const s = Number(r.start);
      const e = Number(r.end);
      if (s <= 1 && e >= 1) sawYes = true;
      if (s <= 2 && e >= 2) sawNo = true;
    }
  }
  if (tokenAmount === 0n) return null;
  if (sawYes && sawNo) return null; // paired transfer — not a single-side trade
  if (!sawYes && !sawNo) return null;

  // Sum non-fee coin transfers. Protocol fees skew the implied price.
  let coinAmount = 0n;
  for (const ct of event.coinTransfers) {
    if (ct.IsProtocolFee) continue;
    coinAmount += BigInt(ct.Amount);
  }
  if (coinAmount === 0n) return null;

  const ratio = Number(coinAmount) / Number(tokenAmount);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) return null;
  return sawYes ? ratio : 1 - ratio;
}

/**
 * Parsed `cast_vote` message event — emitted by every MsgCastVote regardless
 * of which approval level. We tally these locally because the chain's
 * `/get_votes` REST endpoint requires a non-empty `approverAddress` path
 * segment, and collection-level approvals use empty string (grpc-gateway
 * collapses `/foo//bar` so the query returns nothing). Tx events have all the
 * fields we need anyway.
 */
export interface CastVote {
  collectionId: string;
  approvalId: string;
  proposalId: string;
  voter: string;
  yesWeight: number;
  voterWeight: number;
}

export function parseCastVotes(events: RawEvent[]): CastVote[] {
  // Accept BOTH `message` (native Cosmos signing path) and `indexer`
  // (EVM-wrapped MsgEthereumTx path — the EVM module strips inner message
  // events from the result, but the chain re-emits them as `indexer` events
  // so consumers like this aggregator and bitbadges-indexer can still see
  // them). De-dup by (collectionId, approvalId, voter, msgIndex) so a
  // single vote isn't counted twice when both events fire.
  const out: CastVote[] = [];
  const seen = new Set<string>();
  for (const e of events ?? []) {
    if (e.type !== 'message' && e.type !== 'indexer') continue;
    const a = attrs(e);
    if (a.module !== 'tokenization') continue;
    if (a.msg_type !== 'cast_vote') continue;
    if (!a.collection_id || !a.approval_id) continue;
    const dedupKey = `${a.collection_id}|${a.approval_id}|${a.voter ?? ''}|${a.msg_index ?? ''}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push({
      collectionId: a.collection_id,
      approvalId: a.approval_id,
      proposalId: a.proposal_id || a.approval_id,
      voter: a.voter ?? '',
      yesWeight: Number(a.yes_weight ?? '0'),
      voterWeight: Number(a.voter_weight ?? '1'),
    });
  }
  return out;
}

interface TxSearchResult {
  result?: {
    total_count?: string;
    txs?: Array<{
      hash?: string;
      height?: string;
      tx_result?: { events?: RawEvent[] };
    }>;
  };
}

/**
 * Query Tendermint RPC `/tx_search` for all historical fills on a collection.
 * Uses the `usedApprovalDetails.collectionId='N'` event index which the chain
 * maintains regardless of the LCD's tx-by-event indexer (which is often off).
 */
export async function searchHistoricalFills(collectionId: string, limit = 100): Promise<UsedApprovalDetails[]> {
  const query = encodeURIComponent(`usedApprovalDetails.collectionId='${collectionId}'`);
  const r = await fetch(
    `${env.rpcHttpUrl}/tx_search?query=%22${query}%22&per_page=${limit}&order_by=%22asc%22`,
  );
  if (!r.ok) throw new Error(`tx_search ${r.status}`);
  const data = (await r.json()) as TxSearchResult;
  const txs = data.result?.txs ?? [];
  const out: UsedApprovalDetails[] = [];
  for (const t of txs) {
    out.push(...parseUsedApprovalDetails(t.tx_result?.events ?? []));
  }
  return out.filter((u) => u.collectionId === collectionId);
}

/**
 * Historical vote scan for a collection. Uses the same Tendermint tx_search
 * with a query that targets the chain's `message.msg_type='cast_vote'`
 * attribute. We then filter to votes on the given collection.
 */
export async function searchHistoricalVotes(collectionId: string, limit = 100): Promise<CastVote[]> {
  // The chain doesn't index `message.collection_id`, so we filter post-fetch.
  const query = encodeURIComponent(`message.msg_type='cast_vote'`);
  const r = await fetch(
    `${env.rpcHttpUrl}/tx_search?query=%22${query}%22&per_page=${limit}&order_by=%22asc%22`,
  );
  if (!r.ok) throw new Error(`tx_search ${r.status}`);
  const data = (await r.json()) as TxSearchResult;
  const txs = data.result?.txs ?? [];
  const out: CastVote[] = [];
  for (const t of txs) {
    out.push(...parseCastVotes(t.tx_result?.events ?? []));
  }
  return out.filter((v) => v.collectionId === collectionId);
}
