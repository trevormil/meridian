import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './env.js';
import { getDb } from './db/index.js';
import { predictions } from './routes/predictions.js';
import { tx } from './routes/tx.js';
import { node } from './routes/node.js';
import { faucet } from './routes/faucet.js';
import { uploads } from './routes/uploads.js';
import { bootstrapScan, startBootstrapLoop } from './workers/bootstrap.js';
import { startPricePoller } from './workers/price-poller.js';
import { startStatsPoller } from './workers/stats-poller.js';
import { startTxWatcher } from './workers/tx-watcher.js';
import { startSeeder } from './bot/seeder.js';
import { startMarketMakerBot } from './bot/market-maker.js';
import { handleOpen, handleClose, handleMessage } from './ws.js';

const app = new Hono();

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type', 'accept', 'authorization'] }));

app.get('/health', (c) =>
  c.json({
    ok: true,
    db: !!getDb(),
    ts: Date.now(),
  }),
);

app.route('/api/v0', predictions);
app.route('/api/v0', tx);
app.route('/api/v0', faucet);
app.route('/api/v0', uploads);
app.route('/', node);

app.onError((err, c) => {
  console.error('[http]', err);
  return c.json({ error: err.message }, 500);
});

// Initialize DB up front
getDb();

// Optional boot-time reset hooks. Useful for CI / "wipe between runs" flows
// without touching the filesystem.
//   AGGREGATOR_RESET=cursor  → re-scan from id 1 next start
//   AGGREGATOR_RESET=full    → drop all tables and re-create schema
if (process.env.AGGREGATOR_RESET === 'cursor') {
  getDb().exec('DELETE FROM sync_state');
  console.log('[reset] cursors cleared — next scan starts from id 1');
} else if (process.env.AGGREGATOR_RESET === 'full') {
  const db = getDb();
  db.exec('DELETE FROM markets; DELETE FROM price_history; DELETE FROM intents; DELETE FROM votes; DELETE FROM sync_state');
  console.log('[reset] full table wipe — re-indexing from scratch');
}

// Kick off workers (non-blocking). DISABLE_WORKERS is a comma-list diagnostic
// gate (bootstrap,price,stats,tx,seeder,mm) for bisecting CPU load — empty in
// normal operation.
const _disabled = new Set((process.env.DISABLE_WORKERS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const enabled = (name: string): boolean => {
  if (_disabled.has(name)) {
    console.log(`[init] worker '${name}' DISABLED via DISABLE_WORKERS`);
    return false;
  }
  return true;
};
if (enabled('bootstrap')) startBootstrapLoop();
if (enabled('price')) startPricePoller();
if (enabled('stats')) startStatsPoller();
// tx-watcher: backfill-only (HTTP tx_search every 90s). The live Tendermint
// WS is disabled — it can't handshake from inside the container and cosmjs
// socket-retries it in a storm that pins the chain CPU.
if (enabled('tx'))
  startTxWatcher().catch((e) => {
    console.warn('[tx-watcher] backfill failed to start —', (e as Error).message);
  });
// block-watcher NOT started: it's pure NewBlock WS (same storm), and the
// bootstrap scan + morning script already discover new markets over HTTP.

// SEED_MODE liquidity seeder — opt-in via env. No-op when fixture missing.
if (enabled('seeder')) startSeeder();
// Market-maker bot — always on. Auto-fills any user order in the 40–60¢ band
// (mints+sells for buys, buys for sells) so trades execute instantly.
if (enabled('mm')) startMarketMakerBot();

// Replaced @hono/node-server with Bun.serve so HTTP + WebSocket share the
// same port. Hono handles all HTTP routes; `Bun.serve.websocket` handles
// the /ws upgrade. Subscribers get state-change broadcasts via pubsub.ts.
Bun.serve({
  port: env.port,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if ((server as any).upgrade(req, { data: { unsubs: new Map() } })) return undefined;
      return new Response('upgrade failed', { status: 426 });
    }
    return app.fetch(req);
  },
  websocket: {
    open: handleOpen as any,
    close: handleClose as any,
    message: handleMessage as any,
  },
});
console.log(`[aggregator] listening on http://localhost:${env.port}  ·  ws on /ws`);
