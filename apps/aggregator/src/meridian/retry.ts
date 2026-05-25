/**
 * Pure retry utilities for the Meridian daily lifecycle scripts. No network,
 * no imports — `now`/`sleep` are injectable so the loops are unit-testable
 * without real waiting.
 */

const realSleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

export interface RetryUntilOpts {
  /** Sleep between passes. */
  intervalMs: number;
  /** Total time budget. <= 0 runs exactly one pass (kill-switch / tests). */
  windowMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onAttempt?: (attempt: number, remainingMs: number) => void;
}

export interface RetryUntilResult<T> {
  remaining: T[];
  attempts: number;
  exhausted: boolean;
}

/**
 * Run `pass` repeatedly until it reports nothing outstanding or the time budget
 * runs out. `pass(attempt)` does the work and returns the items STILL
 * outstanding after that pass — returning the leftover set (rather than a
 * boolean) keeps the loop idempotent and partial-progress-safe: each pass only
 * retries what's left.
 *
 * Guarantees at least one pass even when `windowMs <= 0`.
 */
export async function retryUntil<T>(
  pass: (attempt: number) => Promise<T[]>,
  opts: RetryUntilOpts,
): Promise<RetryUntilResult<T>> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const start = now();
  let attempt = 0;
  let remaining: T[] = [];

  for (;;) {
    attempt++;
    remaining = await pass(attempt);
    if (remaining.length === 0) {
      return { remaining, attempts: attempt, exhausted: false };
    }
    const elapsed = now() - start;
    const remainingMs = opts.windowMs - elapsed;
    // Need room for at least one more interval before the window closes.
    if (remainingMs <= 0 || remainingMs < opts.intervalMs) {
      return { remaining, attempts: attempt, exhausted: true };
    }
    opts.onAttempt?.(attempt, remainingMs);
    await sleep(opts.intervalMs);
  }
}

export interface BackoffOpts {
  /** Total attempts (>= 1). */
  attempts: number;
  baseMs: number;
  factor?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Return false to stop retrying a given error (default: always retry). */
  shouldRetry?: (e: unknown, attempt: number) => boolean;
  onRetry?: (e: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Run `fn` with exponential backoff. Resolves with the first success; rejects
 * with the last error after `attempts` tries (or when `shouldRetry` returns
 * false).
 */
export async function withBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: BackoffOpts,
): Promise<T> {
  const sleep = opts.sleep ?? realSleep;
  const factor = opts.factor ?? 2;
  const maxMs = opts.maxMs ?? Infinity;
  const attempts = Math.max(1, opts.attempts);
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt >= attempts) break;
      if (opts.shouldRetry && !opts.shouldRetry(e, attempt)) break;
      const delayMs = Math.min(maxMs, opts.baseMs * factor ** (attempt - 1));
      opts.onRetry?.(e, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}
