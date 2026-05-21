import { Tendermint37Client } from '@cosmjs/tendermint-rpc';
import { env } from '../env.js';
import { getCollection } from '../chain/lcd.js';
import { upsertMarket } from './bootstrap.js';
import { fetchIntentsForAddress } from '../chain/intents.js';
import { upsertIntents } from '../db/intents.js';
import { getDb } from '../db/index.js';

/**
 * Subscribe to Tendermint NewBlock events and react to messages relevant to
 * prediction markets: collection creation/update, approval changes, vote casts,
 * transfers (to detect intent fills).
 *
 * Event keys are heuristic — production parsing would use bitbadges proto event
 * definitions. We pull the addresses out of attribute lists, then re-fetch the
 * authoritative state from LCD. This is robust to schema drift at the cost of
 * extra LCD reads.
 */
export async function startBlockWatcher(): Promise<() => void> {
  const client = await Tendermint37Client.connect(env.tendermintWsUrl);
  console.log('[block-watcher] connected to', env.tendermintWsUrl);

  const stream = client.subscribeNewBlock();
  const sub = stream.subscribe({
    next: (evt: unknown) => {
      handleBlock(evt as NewBlockEvt).catch((e) => console.error('[block-watcher]', e));
    },
    error: (err) => console.error('[block-watcher] stream error:', err),
    complete: () => console.log('[block-watcher] stream complete'),
  });

  return () => {
    sub.unsubscribe();
    client.disconnect();
  };
}

interface NewBlockEvt {
  block?: any;
  blockId?: any;
}

async function handleBlock(evt: NewBlockEvt): Promise<void> {
  const txs: any[] = evt.block?.txs ?? [];
  if (!txs.length) return;
  // The richest information lives in BeginBlock/EndBlock events, but for v1 we
  // re-fetch state for any collection ID mentioned in tx events. Real decoding
  // is out of scope; the LCD round-trip is acceptable for low TPS.
  const collectionIds = extractCollectionIds(evt);
  const addresses = extractAddresses(evt);

  for (const id of collectionIds) {
    try {
      const c = await getCollection(id);
      if (c) upsertMarket(c);
    } catch (e) {
      console.warn(`[block-watcher] refresh collection ${id}:`, (e as Error).message);
    }
  }

  // Refresh intents for any address we saw that already has known markets.
  const known = getDb().prepare('SELECT collection_id FROM markets').all() as { collection_id: string }[];
  for (const a of addresses) {
    for (const m of known) {
      try {
        const rows = await fetchIntentsForAddress(m.collection_id, a);
        upsertIntents(rows);
      } catch (e) {
        // Address may not have a balance store on this collection — ignore.
      }
    }
  }
}

function extractCollectionIds(evt: any): string[] {
  // Walk attributes for any key that contains 'collection_id'.
  const events = evt.resultBeginBlock?.events ?? evt.block?.last_commit?.events ?? [];
  const ids = new Set<string>();
  for (const e of events) {
    for (const a of e.attributes ?? []) {
      if (a.key?.toLowerCase().includes('collection') && a.value) ids.add(String(a.value));
    }
  }
  return [...ids];
}

function extractAddresses(evt: any): string[] {
  const events = evt.resultBeginBlock?.events ?? evt.block?.last_commit?.events ?? [];
  const addrs = new Set<string>();
  for (const e of events) {
    for (const a of e.attributes ?? []) {
      const v = String(a.value ?? '');
      if (v.startsWith('bb1') || v.startsWith('cosmos1')) addrs.add(v);
    }
  }
  return [...addrs];
}
