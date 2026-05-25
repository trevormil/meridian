import { env } from '@/lib/env';

/** Live chain-explorer data, served by the aggregator's /api/v0/chain/* proxy
 *  (CORS-safe; talks to the host Tendermint RPC + Cosmos LCD server-side). */

export interface BlockSummary {
  height: number;
  time: string;
  numTxs: number;
  proposer: string;
  signatures: number;
}

export interface ValidatorSummary {
  address: string;
  votingPower: number;
  proposerPriority: number;
  powerPct: number;
}

export interface ChainOverview {
  chainId: string | null;
  moniker: string | null;
  height: number;
  latestBlockTime: string | null;
  catchingUp: boolean;
  tmVersion: string | null;
  appVersion: string | null;
  nPeers: number;
  blockTimeSec: number | null;
  validators: ValidatorSummary[];
  blocks: BlockSummary[];
}

export interface ChainLogs {
  mounted: boolean;
  lines: string[];
  error?: string;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${env.aggregatorUrl}/api/v0${path}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`chain ${r.status}: ${path}`);
  return (await r.json()) as T;
}

export const getChainOverview = (): Promise<ChainOverview> => get<ChainOverview>('/chain/overview');
export const getChainLogs = (tail = 200): Promise<ChainLogs> => get<ChainLogs>(`/chain/logs?tail=${tail}`);
