/**
 * Full end-to-end test of the Meridian morning + evening scripts.
 *
 * Runs the actual scripts as child processes (so we exercise the real CLI
 * surface a cron job would hit) against the **already-running dev
 * aggregator on port 4001 + the local chain**. Deterministic via two env
 * var overrides:
 *
 *   MERIDIAN_CLOSE_DATE      — pins the close-date to a future sentinel
 *                              (`2099-12-31`) so we don't collide with
 *                              today's real markets in the same DB
 *   MERIDIAN_PRICE_OVERRIDE  — JSON map of {SYMBOL: {close, previousClose}}
 *                              that bypasses the Yahoo fetch
 *
 *   bun test test/meridian/e2e.spec.ts
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getDb } from '../../src/db/index.js';
import { ensureMeridianTables, type MeridianRow } from '../../src/meridian/db.js';
import { calculateStrikes } from '../../src/meridian/strikes.js';
import { MAG7 } from '../../src/meridian/constants.js';

const CLOSE_DATE = '2099-12-31';

const PREV_CLOSE: Record<string, number> = {
  AAPL: 230,
  MSFT: 420,
  GOOGL: 390,
  AMZN: 200,
  NVDA: 100,
  META: 600,
  TSLA: 300,
};

// "Today's" close — picked so each strike resolves cleanly to YES or NO.
// For each ticker, today's close is +5% from prev, so the strikes at -9/-6/-3% + 0%
// resolve YES (close ≥ strike) and the +3/+6/+9% ones resolve NO.
const CURRENT_CLOSE: Record<string, number> = Object.fromEntries(
  Object.entries(PREV_CLOSE).map(([k, v]) => [k, +(v * 1.05).toFixed(2)]),
);

const MORNING_OVERRIDE = JSON.stringify(
  Object.fromEntries(
    Object.entries(PREV_CLOSE).map(([k, v]) => [k, { close: v, previousClose: v }]),
  ),
);

const EVENING_OVERRIDE = JSON.stringify(
  Object.fromEntries(
    Object.entries(CURRENT_CLOSE).map(([k, v]) => [k, { close: v, previousClose: PREV_CLOSE[k] }]),
  ),
);

const AGG_CWD = resolve(import.meta.dir, '../..');

function runScript(script: 'morning.ts' | 'evening.ts', priceOverride: string): string {
  const r = spawnSync('bun', ['run', `src/meridian/${script}`], {
    cwd: AGG_CWD,
    env: {
      ...process.env,
      MERIDIAN_CLOSE_DATE: CLOSE_DATE,
      MERIDIAN_PRICE_OVERRIDE: priceOverride,
    },
    encoding: 'utf8',
  });
  if (r.status !== 0 && r.status !== 1) {
    // status 1 = some rows failed but not catastrophic; status 0 = clean.
    throw new Error(`script ${script} crashed with status ${r.status}: ${r.stderr || r.stdout}`);
  }
  return r.stdout + r.stderr;
}

function dbRows(): MeridianRow[] {
  return getDb()
    .prepare('SELECT * FROM meridian_markets WHERE close_date = ? ORDER BY ticker, strike')
    .all(CLOSE_DATE) as MeridianRow[];
}

beforeAll(() => {
  ensureMeridianTables();
  // Clean slate for this sentinel date so re-runs are deterministic.
  getDb().prepare('DELETE FROM meridian_markets WHERE close_date = ?').run(CLOSE_DATE);
});

afterAll(() => {
  // Cleanup so the test doesn't leave 2099-12-31 ghost rows behind.
  getDb().prepare('DELETE FROM meridian_markets WHERE close_date = ?').run(CLOSE_DATE);
});

test('morning creates one market per (ticker, strike); idempotent on re-run', () => {
  const out1 = runScript('morning.ts', MORNING_OVERRIDE);
  const rows1 = dbRows();

  // Expected count: sum of dedup'd strikes across all MAG7.
  const expected = MAG7.reduce((sum, t) => sum + calculateStrikes(PREV_CLOSE[t]).length, 0);
  expect(rows1.length).toBe(expected);

  // Every ticker should have its strike set populated.
  for (const t of MAG7) {
    const ks = calculateStrikes(PREV_CLOSE[t]);
    const got = rows1.filter((r) => r.ticker === t).map((r) => r.strike).sort((a, b) => a - b);
    expect(got).toEqual(ks);
  }

  // Re-run morning — must be a complete no-op.
  const out2 = runScript('morning.ts', MORNING_OVERRIDE);
  const rows2 = dbRows();
  expect(rows2.length).toBe(rows1.length);
  expect(out2).toContain('already-existed');
}, 600_000);

test('evening settles every market; outcome = (close ≥ strike); idempotent', () => {
  const before = dbRows();
  expect(before.length).toBeGreaterThan(0);
  expect(before.every((r) => !r.settled)).toBe(true);

  runScript('evening.ts', EVENING_OVERRIDE);

  const after = dbRows();
  expect(after.length).toBe(before.length);
  for (const r of after) {
    expect(r.settled).toBe(1);
    expect(r.settlement_price).toBeCloseTo(CURRENT_CLOSE[r.ticker], 2);
    const expected: 'yes' | 'no' = CURRENT_CLOSE[r.ticker] >= r.strike ? 'yes' : 'no';
    expect(r.settlement_outcome).toBe(expected);
  }

  // Mix of yes + no across the whole batch (sanity — not all the same).
  const outcomes = new Set(after.map((r) => r.settlement_outcome));
  expect(outcomes.has('yes')).toBe(true);
  expect(outcomes.has('no')).toBe(true);

  // Re-run evening — must be a no-op since everything is already settled.
  const out2 = runScript('evening.ts', EVENING_OVERRIDE);
  const after2 = dbRows();
  expect(after2.every((r) => r.settled === 1)).toBe(true);
  expect(out2).toContain('nothing to settle');
}, 600_000);
