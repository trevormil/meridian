export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll an async predicate until it returns truthy or times out.
 */
export async function until<T>(
  fn: () => Promise<T | null | undefined | false>,
  opts: { timeoutMs?: number; intervalMs?: number; what?: string } = {},
): Promise<T> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const intervalMs = opts.intervalMs ?? 500;
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fn();
      if (r) return r as T;
    } catch {
      // swallow; retry
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${opts.what ?? 'condition'} after ${timeoutMs}ms`);
}
