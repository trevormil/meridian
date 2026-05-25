'use client';

import { useEffect, useRef, useState } from 'react';

interface PollState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Poll an async fetcher on an interval. Pauses while the tab is hidden (no
 * point hammering the node in a background tab) and resumes on focus. Keeps the
 * last good `data` across transient errors so the UI doesn't flicker to empty.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): PollState<T> {
  const [state, setState] = useState<PollState<T>>({ data: null, error: null, loading: true });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const data = await fetcherRef.current();
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (e) {
        if (!cancelled) setState((s) => ({ data: s.data, error: e as Error, loading: false }));
      }
    };

    tick();
    timer = setInterval(tick, intervalMs);
    const onVis = () => {
      if (typeof document !== 'undefined' && !document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);

  return state;
}
