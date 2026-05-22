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

/** Channels whose last snapshot is worth persisting across hard reloads.
 *  The browse list is the big perceived-latency win; per-market channels are
 *  cheap to re-snapshot so we don't bloat sessionStorage with them. */
const PERSIST_CHANNELS = new Set(['markets']);
const PERSIST_PREFIX = 'meridian:rt:';

class Realtime {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  /** Last payload seen per channel — handed to new subscribers synchronously
   *  so route-changes and re-mounts don't flash a skeleton while the WS
   *  round-trips for the same data again. */
  private cache = new Map<string, unknown>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = 500;
  private intentionallyClosed = false;

  constructor() {
    // Hydrate persisted snapshots so a HARD reload (empty in-memory cache)
    // paints the browse list instantly from the last-seen value, then the WS
    // revalidates. Wrapped in try/catch — sessionStorage can throw in private
    // mode / SSR.
    if (typeof window !== 'undefined') {
      for (const channel of PERSIST_CHANNELS) {
        try {
          const raw = sessionStorage.getItem(PERSIST_PREFIX + channel);
          if (raw) this.cache.set(channel, JSON.parse(raw));
        } catch {
          // ignore
        }
      }
    }
  }

  private persist(channel: string, data: unknown): void {
    if (!PERSIST_CHANNELS.has(channel) || typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(PERSIST_PREFIX + channel, JSON.stringify(data));
    } catch {
      // quota / serialization — non-fatal
    }
  }

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
      this.cache.set(msg.channel, msg.data);
      this.persist(msg.channel, msg.data);
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

    // Hand the cached value synchronously so a fresh subscriber doesn't have
    // to wait for the WS round-trip to render. Newly arriving WS messages
    // overwrite this immediately.
    const cached = this.cache.get(channel);
    if (cached !== undefined) {
      // Defer one microtask so React doesn't see setState in the same render
      // pass that scheduled the effect.
      queueMicrotask(() => fn(cached as T));
    }

    if (isNew) {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) this.connect();
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

  /** Open the WS eagerly so it's ready by the time the first useRealtime
   *  hook mounts. Called once from a top-level effect at app load. */
  warmup(): void {
    if (typeof window === 'undefined') return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) this.connect();
  }

  /** Seed a channel's cache from a non-WS source (e.g. a REST fetch on cold
   *  load) so the UI paints before the socket connects. Notifies listeners +
   *  persists, just like an incoming message. A subsequent WS snapshot for the
   *  same channel overwrites it. No-op if the WS already delivered a value. */
  seed<T>(channel: string, data: T): void {
    if (this.cache.has(channel)) return; // WS already won — don't clobber
    this.cache.set(channel, data);
    this.persist(channel, data);
    const set = this.listeners.get(channel);
    if (set) for (const fn of set) (fn as Listener<T>)(data);
  }
}

export const realtime = new Realtime();

/** Peek the last-seen payload for a channel without subscribing. Useful for
 *  seeding React state synchronously on first render. */
export function getCached<T>(channel: string): T | undefined {
  return (realtime as any).cache.get(channel) as T | undefined;
}

// Mirror the aggregator's channel-name helpers so FE producers can't drift.
export const ch = {
  markets: 'markets',
  market: (id: string) => `market:${id}`,
  intents: (id: string) => `intents:${id}`,
  intentsOwner: (addr: string) => `intents-owner:${addr}`,
  candle: (id: string) => `candle:${id}`,
  fills: (id: string) => `fills:${id}`,
};
