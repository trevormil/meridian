import { env } from './env';

export interface MarketDto {
  collectionId: string;
  metadataUri: string | null;
  name: string | null;
  description: string | null;
  image: string | null;
  verifierAddress: string | null;
  depositDenom: string | null;
  depositAmount: string | null;
  poolId: string | null;
  status: 'active' | 'closed' | 'resolved-yes' | 'resolved-no' | 'resolved-push' | 'unknown';
  yesPrice: number;
  noPrice: number;
  totalDeposited: string;
  resolutionDate: number | null;
}

export interface PricePoint {
  time: number;
  value: number;
}

export interface IntentDto {
  collectionId: string;
  approvalLevel: 'incoming' | 'outgoing';
  /** Address that posted the approval (the order owner). FE uses `approverAddress`. */
  approverAddress: string;
  /** Alias for approverAddress; kept for older code paths. */
  ownerAddress: string;
  approvalId: string;
  payDenom: string | null;
  receiveDenom: string | null;
  payAmount: string | null;
  receiveAmount: string | null;
  transferTimes: { start: number | null; end: number | null };
  used: boolean;
  isActive: boolean;
  isPending: boolean;
  isExpired: boolean;
}

export interface FillDto {
  collectionId: string;
  approvalId: string;
  approverAddress: string;
  ts: number;
  side: 'yes' | 'no';
  tokenAmount: string;
  coinAmount: string;
  /** Implied YES probability 0..1 at the moment of the fill. */
  price: number;
  fromAddress: string;
  toAddress: string;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${env.aggregatorUrl}/api/v0${path}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`aggregator ${r.status}: ${path}`);
  return (await r.json()) as T;
}

async function post<T>(path: string): Promise<T> {
  const r = await fetch(`${env.aggregatorUrl}/api/v0${path}`, { method: 'POST', cache: 'no-store' });
  if (!r.ok) throw new Error(`aggregator ${r.status}: ${path}`);
  return (await r.json()) as T;
}

export const aggregator = {
  listMarkets: () => get<{ predictions: MarketDto[] }>('/predictions').then((r) => r.predictions),
  refresh: () => post<{ ok: boolean; scanned: number; found: number }>('/refresh'),
  getMarket: (id: string) =>
    get<{ prediction: MarketDto; collection: unknown }>(`/predictions/${id}`).then((r) => r.prediction),
  getMarketRaw: (id: string) => get<{ prediction: MarketDto; collection: unknown }>(`/predictions/${id}`),
  getPrices: (id: string, timeframe: '10m' | '1h' | '1d' = '1h') =>
    get<{ prices: { yes: PricePoint[]; no: PricePoint[] } }>(`/predictions/${id}/prices?timeframe=${timeframe}`).then(
      (r) => r.prices,
    ),
  listIntents: (collectionId: string, includeAll = false) =>
    get<{ intents: IntentDto[] }>(`/intents?collectionId=${collectionId}&includeAll=${includeAll}`).then(
      (r) => r.intents,
    ),
  listMyIntents: (address: string, collectionId?: string, includeAll = false) =>
    get<{ intents: IntentDto[] }>(
      `/intents/${address}?includeAll=${includeAll}${collectionId ? `&collectionId=${collectionId}` : ''}`,
    ).then((r) => r.intents),
  // Synchronously force the aggregator to re-scan fills + votes for one market.
  // Call after a verifier vote (or any tx) where you can't afford to wait on
  // the live tx-watcher in case the WS event stream missed the tx.
  refreshFills: (id: string) =>
    post<{ ok: boolean; fills: number; votes: number }>(`/predictions/${id}/refresh-fills`),
  listFills: (id: string, limit = 100) =>
    get<{ fills: FillDto[] }>(`/predictions/${id}/fills?limit=${limit}`).then((r) => r.fills),
};
