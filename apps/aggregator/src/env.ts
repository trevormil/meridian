import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4001),
  lcdUrl: req('LCD_URL', 'http://localhost:1317'),
  rpcUrl: req('RPC_URL', 'http://localhost:26657'),
  /** Tendermint HTTP RPC base (for /tx_search etc). Defaults to RPC_URL. */
  rpcHttpUrl: process.env.RPC_HTTP_URL ?? process.env.RPC_URL ?? 'http://localhost:26657',
  tendermintWsUrl: req('TENDERMINT_WS_URL', 'ws://localhost:26657/websocket'),
  dbPath: req('DB_PATH', './data/aggregator.sqlite'),
  /** How often to check chain height for the block-based price poll. */
  blockCheckIntervalMs: Number(process.env.BLOCK_CHECK_INTERVAL_MS ?? 3_000),
  /** Fire a price update every N blocks. */
  pricePollEveryBlocks: Number(process.env.PRICE_POLL_EVERY_BLOCKS ?? 5),
  bootstrapMaxCollectionId: Number(process.env.BOOTSTRAP_MAX_COLLECTION_ID ?? 10_000),
  /** USDC denom for the faucet endpoint. Matches the FE's NEXT_PUBLIC_USDC_DENOM. */
  usdcDenom: process.env.USDC_DENOM ?? 'ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349',
  /** stats-poller cadence. Escrow only moves on deposits/redeems; recordFill
   * also event-triggers a per-market refresh, so this is just a safety net. */
  statsPollIntervalMs: Number(process.env.STATS_POLL_INTERVAL_MS ?? 60_000),
  /** How long resolved markets stay in the aggregator's DB before being purged
   * (with all their candles, fills, intents, votes). Set to 0 to keep forever. */
  resolvedRetentionDays: Number(process.env.MERIDIAN_RESOLVED_RETENTION_DAYS ?? 3),
  /** gc-worker cadence. Once-a-day is plenty for a 3-day retention window. */
  gcIntervalMs: Number(process.env.GC_INTERVAL_MS ?? 24 * 60 * 60 * 1000),
};
