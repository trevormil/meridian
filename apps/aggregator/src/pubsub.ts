import { EventEmitter } from 'node:events';

/**
 * Aggregator-wide event bus. State-mutation paths (upsertMarket, recordCandle,
 * sync intents, status flips) emit on channels here; the WS server forwards
 * to subscribed clients.
 *
 * Channel naming:
 *   markets                    — array of MarketDto (full list) on any add/change
 *   market:{collectionId}      — single MarketDto on price / status / volume change
 *   intents:{collectionId}     — array of IntentDto for that market
 *   intents-owner:{address}    — array of IntentDto for that owner (all collections)
 *   candle:{collectionId}      — latest candle on emit (chart streaming)
 */
class Bus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(500);
  }
}

export const bus = new Bus();

/** Emit a channel update. Listeners receive `data` as the single argument. */
export function publish(channel: string, data: unknown): void {
  bus.emit(channel, data);
}

/**
 * Publish only when the channel has at least one subscriber, building the
 * payload lazily via `build()` so we never pay snapshot-serialization cost for
 * a channel nobody is watching. Safe because `subscribeOne` (ws.ts) sends a
 * fresh snapshot on subscribe — a late subscriber never misses state.
 *
 * Critical for owner channels: the seed bot owns ~12k intents and nothing
 * subscribes to `intents-owner:{bot}`, so eagerly serializing its whole book on
 * every intent sync pegged the event loop. With this, that work is skipped.
 */
export function publishLazy(channel: string, build: () => unknown): void {
  if (bus.listenerCount(channel) === 0) return;
  bus.emit(channel, build());
}

/** Subscribe to a channel. Returns an unsubscribe fn. */
export function listen(channel: string, fn: (data: unknown) => void): () => void {
  bus.on(channel, fn);
  return () => {
    bus.off(channel, fn);
  };
}

// Common channel-name helpers — keep producers and consumers in sync.
export const channel = {
  markets: (): 'markets' => 'markets',
  market: (collectionId: string): string => `market:${collectionId}`,
  intents: (collectionId: string): string => `intents:${collectionId}`,
  intentsOwner: (address: string): string => `intents-owner:${address}`,
  candle: (collectionId: string): string => `candle:${collectionId}`,
  fills: (collectionId: string): string => `fills:${collectionId}`,
};
