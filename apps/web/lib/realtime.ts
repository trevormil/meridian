'use client';

import { env } from './env';

/**
 * Singleton WebSocket client for the aggregator's pub/sub bus. Manages a
 * single connection across the whole app, multiplexes channel subscriptions,
 * and auto-reconnects with backoff.
 *
 * Each `subscribe(channel, fn)` call returns an unsubscribe — the underlying
 * server subscription is reference-counted, so the last unsubscribe sends
 * `unsubscribe` upstream.
 *
 * On reconnect, all live channels are re-subscribed and listeners receive a
 * fresh snapshot from the server.
 */

type Listener<T = unknown> = (data: T) => void;

class Realtime {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = 500;
  private intentionallyClosed = false;

  /** Connect (idempotent). Called automatically on first subscribe. */
  private connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.intentionallyClosed = false;
    const url = env.aggregatorUrl.replace(/^http/, 'ws') + '/ws';
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelayMs = 500;
      // Re-subscribe everything when the connection re-opens.
      const channels = [...this.listeners.keys()];
      if (channels.length) {
        ws.send(JSON.stringify({ action: 'subscribe', channels }));
      }
    };

    ws.onmessage = (e) => {
      let msg: { channel?: string; data?: unknown };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!msg.channel) return;
      const set = this.listeners.get(msg.channel);
      if (!set) return;
      for (const fn of set) {
        try {
          fn(msg.data);
        } catch (err) {
          // Don't let a bad listener kill the whole bus.
          console.error('[realtime] listener for', msg.channel, 'threw:', err);
        }
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.intentionallyClosed) return;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will follow and handle reconnect; just nudge it.
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(this.reconnectDelayMs, 10_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 10_000);
      this.connect();
    }, delay);
  }

  subscribe<T>(channel: string, fn: Listener<T>): () => void {
    if (typeof window === 'undefined') return () => {}; // SSR no-op
    let set = this.listeners.get(channel);
    const isNew = !set;
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(fn as Listener);

    if (isNew) {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) this.connect();
      // Send subscribe if already open; otherwise onopen will batch-resubscribe.
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'subscribe', channel }));
      }
    }

    return () => {
      const s = this.listeners.get(channel);
      if (!s) return;
      s.delete(fn as Listener);
      if (s.size === 0) {
        this.listeners.delete(channel);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'unsubscribe', channel }));
        }
      }
    };
  }
}

export const realtime = new Realtime();

// Mirror the aggregator's channel-name helpers so FE producers can't drift.
export const ch = {
  markets: 'markets',
  market: (id: string) => `market:${id}`,
  intents: (id: string) => `intents:${id}`,
  intentsOwner: (addr: string) => `intents-owner:${addr}`,
  candle: (id: string) => `candle:${id}`,
};
