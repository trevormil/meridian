import type { ServerWebSocket } from 'bun';
import { listen } from './pubsub.js';
import {
  snapshotMarkets,
  snapshotMarket,
  snapshotIntents,
  snapshotIntentsOwner,
  snapshotCandle,
} from './snapshots.js';

/**
 * WebSocket wiring. Clients send:
 *   {"action":"subscribe","channel":"market:1"}
 *   {"action":"unsubscribe","channel":"market:1"}
 *
 * On subscribe we immediately send the current snapshot so callers don't have
 * to also hit the REST endpoint. Subsequent updates are streamed when the bus
 * publishes to that channel.
 *
 * Channel naming matches `pubsub.ts`:
 *   markets · market:{id} · intents:{id} · intents-owner:{addr} · candle:{id}
 */

interface SocketData {
  /** channel → unsubscribe fn for the bus listener. */
  unsubs: Map<string, () => void>;
}

export function handleOpen(ws: ServerWebSocket<SocketData>): void {
  ws.data.unsubs = new Map();
}

export function handleClose(ws: ServerWebSocket<SocketData>): void {
  for (const off of ws.data.unsubs.values()) off();
  ws.data.unsubs.clear();
}

export function handleMessage(ws: ServerWebSocket<SocketData>, raw: string | Buffer): void {
  let msg: { action?: string; channel?: string; channels?: string[] };
  try {
    msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    ws.send(JSON.stringify({ error: 'malformed_json' }));
    return;
  }

  const channels = msg.channel ? [msg.channel] : msg.channels ?? [];
  if (!channels.length) {
    ws.send(JSON.stringify({ error: 'missing_channel' }));
    return;
  }

  if (msg.action === 'subscribe') {
    for (const ch of channels) subscribeOne(ws, ch);
  } else if (msg.action === 'unsubscribe') {
    for (const ch of channels) unsubscribeOne(ws, ch);
  } else {
    ws.send(JSON.stringify({ error: 'unknown_action', action: msg.action }));
  }
}

function send(ws: ServerWebSocket<SocketData>, channel: string, data: unknown): void {
  try {
    ws.send(JSON.stringify({ channel, data }));
  } catch {
    // socket closed during emit — caller should clean up via handleClose
  }
}

function subscribeOne(ws: ServerWebSocket<SocketData>, channel: string): void {
  if (ws.data.unsubs.has(channel)) return; // already subscribed
  // 1. Send initial snapshot.
  const initial = initialSnapshot(channel);
  if (initial !== undefined) send(ws, channel, initial);
  // 2. Wire bus listener for future updates.
  const off = listen(channel, (data) => send(ws, channel, data));
  ws.data.unsubs.set(channel, off);
}

function unsubscribeOne(ws: ServerWebSocket<SocketData>, channel: string): void {
  const off = ws.data.unsubs.get(channel);
  if (!off) return;
  off();
  ws.data.unsubs.delete(channel);
}

/** Build the snapshot payload for a channel — same shape as bus updates. */
function initialSnapshot(channel: string): unknown {
  if (channel === 'markets') return snapshotMarkets();
  if (channel.startsWith('market:')) return snapshotMarket(channel.slice('market:'.length));
  if (channel.startsWith('intents:')) return snapshotIntents(channel.slice('intents:'.length));
  if (channel.startsWith('intents-owner:')) return snapshotIntentsOwner(channel.slice('intents-owner:'.length));
  if (channel.startsWith('candle:')) return snapshotCandle(channel.slice('candle:'.length));
  return undefined;
}
