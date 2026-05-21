'use client';

import { useEffect, useState } from 'react';
import { realtime } from './realtime';

/**
 * Subscribe to a realtime channel and store the latest payload in component
 * state. The aggregator sends a snapshot immediately on subscribe, so initial
 * render gets data without a separate REST fetch.
 *
 * Pass `null` for `channel` to skip subscription — useful for conditional
 * channels (e.g., owner channel depends on a connected wallet).
 */
export function useRealtime<T>(channel: string | null): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!channel) {
      setData(null);
      return;
    }
    setData(null); // reset on channel change so stale data doesn't flash
    return realtime.subscribe<T>(channel, setData);
  }, [channel]);
  return data;
}
