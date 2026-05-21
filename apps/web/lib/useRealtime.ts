'use client';

import { useEffect, useState } from 'react';
import { realtime, getCached } from './realtime';

/**
 * Subscribe to a realtime channel and store the latest payload in component
 * state. The realtime singleton caches the last-seen value per channel, so
 * re-mounting components and route navigations render with data instantly
 * instead of flashing a skeleton while the WS re-snapshots. New WS messages
 * overwrite the cache + trigger a re-render.
 *
 * Pass `null` for `channel` to skip subscription.
 */
export function useRealtime<T>(channel: string | null): T | null {
  // Seed state from the cache synchronously so the FIRST render already has
  // data when the user navigates back to a screen they've seen before.
  const [data, setData] = useState<T | null>(() => (channel ? (getCached<T>(channel) ?? null) : null));
  useEffect(() => {
    if (!channel) {
      setData(null);
      return;
    }
    // Don't clear — keep showing the cached value while waiting for fresh.
    const cached = getCached<T>(channel);
    if (cached !== undefined) setData(cached as T);
    return realtime.subscribe<T>(channel, setData);
  }, [channel]);
  return data;
}
