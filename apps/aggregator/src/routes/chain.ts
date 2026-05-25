import { Hono } from 'hono';
import { env } from '../env.js';

/**
 * Chain explorer endpoints — server-side proxies to the host node's Tendermint
 * RPC + Cosmos LCD so the browser hits one CORS-friendly origin (the
 * aggregator) instead of the raw RPC. Powers the FE /explorer tab.
 *
 * Single-validator devnet: round is ~always 0, the lone validator proposes and
 * signs every block at 100% voting power. The UI leans into that honestly.
 */
export const chain = new Hono();

const RPC = env.rpcHttpUrl;
const LCD = env.lcdUrl;

async function rpc<T>(path: string): Promise<T> {
  const r = await fetch(`${RPC}${path}`, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`rpc ${path}: ${r.status}`);
  return (await r.json()) as T;
}

async function lcd<T>(path: string): Promise<T> {
  const r = await fetch(`${LCD}${path}`, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`lcd ${path}: ${r.status}`);
  return (await r.json()) as T;
}

// Tiny TTL cache so N concurrent viewers don't fan out onto the node.
const cache = new Map<string, { at: number; data: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

interface BlockSummary {
  height: number;
  time: string;
  numTxs: number;
  proposer: string;
  signatures: number;
}

async function fetchBlock(height: number | 'latest'): Promise<BlockSummary | null> {
  try {
    const j = await lcd<any>(`/cosmos/base/tendermint/v1beta1/blocks/${height}`);
    const h = j.block?.header;
    if (!h) return null;
    const sigs = (j.block?.last_commit?.signatures ?? []).filter(
      (s: any) => s.block_id_flag === 'BLOCK_ID_FLAG_COMMIT' || s.block_id_flag === 2,
    ).length;
    return {
      height: Number(h.height),
      time: h.time,
      numTxs: (j.block?.data?.txs ?? []).length,
      proposer: h.proposer_address ?? '',
      signatures: sigs,
    };
  } catch {
    return null;
  }
}

chain.get('/chain/overview', async (c) => {
  try {
    const data = await cached('overview', 1500, async () => {
      const [statusR, abciR, netR, valsR] = await Promise.allSettled([
        rpc<any>('/status'),
        rpc<any>('/abci_info'),
        rpc<any>('/net_info'),
        lcd<any>('/cosmos/base/tendermint/v1beta1/validatorsets/latest'),
      ]);
      const status = statusR.status === 'fulfilled' ? statusR.value.result : null;
      const sync = status?.sync_info ?? {};
      const ni = status?.node_info ?? {};
      const app = abciR.status === 'fulfilled' ? abciR.value.result?.response : {};
      const nPeers = netR.status === 'fulfilled' ? Number(netR.value.result?.n_peers ?? 0) : 0;
      const height = Number(sync.latest_block_height ?? 0);

      // Recent blocks (parallel) for the live feed + avg block-time.
      const want = 12;
      const heights = Array.from({ length: Math.min(want, height) }, (_, i) => height - i);
      const blocks = (await Promise.all(heights.map((h) => fetchBlock(h)))).filter(Boolean) as BlockSummary[];
      let blockTimeSec: number | null = null;
      if (blocks.length >= 2) {
        const newest = new Date(blocks[0].time).getTime();
        const oldest = new Date(blocks[blocks.length - 1].time).getTime();
        blockTimeSec = +(((newest - oldest) / 1000) / (blocks.length - 1)).toFixed(2);
      }

      const validators = (valsR.status === 'fulfilled' ? valsR.value.validators ?? [] : []).map((v: any) => ({
        address: v.address,
        votingPower: Number(v.voting_power ?? 0),
        proposerPriority: Number(v.proposer_priority ?? 0),
      }));
      const totalPower = validators.reduce((s: number, v: any) => s + v.votingPower, 0) || 1;

      return {
        chainId: ni.network ?? null,
        moniker: ni.moniker ?? null,
        height,
        latestBlockTime: sync.latest_block_time ?? null,
        catchingUp: !!sync.catching_up,
        tmVersion: ni.version ?? null,
        appVersion: app?.version ?? null,
        nPeers,
        blockTimeSec,
        validators: validators.map((v: any) => ({ ...v, powerPct: Math.round((v.votingPower / totalPower) * 100) })),
        blocks,
      };
    });
    return c.json(data);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/**
 * Tail of the node's logs. Requires the host to ship `bitbadgeschain`'s
 * journalctl output to CHAIN_LOG_FILE and bind-mount it read-only into this
 * container (see deploy/README.md). Until then, returns mounted:false so the
 * FE shows a graceful empty state. Tail-only + capped — read-only on a devnet.
 */
chain.get('/chain/logs', async (c) => {
  const path = process.env.CHAIN_LOG_FILE;
  const tail = Math.min(Number(c.req.query('tail') ?? 200), 500);
  if (!path) return c.json({ mounted: false, lines: [] });
  try {
    const f = Bun.file(path);
    if (!(await f.exists())) return c.json({ mounted: false, lines: [] });
    // Read only the trailing window so a large log isn't slurped each poll.
    const size = f.size;
    const start = Math.max(0, size - 96 * 1024);
    const text = await f.slice(start).text();
    // The node logs in color; journalctl -o cat preserves the ANSI escapes.
    // Strip them so the browser renders clean text (the FE re-colors by level).
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const lines = text.split('\n').filter((l) => l.length > 0).map(stripAnsi);
    return c.json({ mounted: true, lines: lines.slice(-tail) });
  } catch (e) {
    return c.json({ mounted: false, lines: [], error: (e as Error).message });
  }
});
