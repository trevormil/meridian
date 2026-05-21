'use client';

import { useEffect } from 'react';
import { realtime } from '@/lib/realtime';

/**
 * Eagerly opens the realtime WebSocket on app mount. Without this, the
 * connection only opens on the first useRealtime() call — meaning the browse
 * page blocks on the WS round-trip before painting markets.
 */
export function RealtimeWarmup() {
  useEffect(() => {
    realtime.warmup();
  }, []);
  return null;
}
