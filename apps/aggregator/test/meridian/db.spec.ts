/**
 * Unit tests for the Meridian sidecar table + close-date helper. Runs against
 * an isolated temp SQLite file (no chain, no network) so we can assert the
 * idempotency guarantees the cron retries depend on.
 *
 *   bun test test/meridian/db.spec.ts
 *
 * DB_PATH is pointed at a throwaway file BEFORE the db module is imported, so
 * getDb()'s singleton binds to it instead of the real ./data store.
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const TMP_DB = join(tmpdir(), `meridian-db-spec-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_PATH = TMP_DB;

// Dynamic import AFTER DB_PATH is set: env.ts reads DB_PATH at module-eval time.
const {
  ensureMeridianTables,
  insertMeridianMarket,
  findMarketByStrike,
  listUnsettledForDate,
  markSettled,
  easternTradingDay,
} = await import('../../src/meridian/db.js');

const DATE = '2099-01-15';
const OTHER_DATE = '2099-01-16';

beforeAll(() => {
  ensureMeridianTables();
});

afterAll(() => {
  // bun:sqlite WAL leaves -wal/-shm siblings; sweep them too.
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(TMP_DB + suffix, { force: true });
  }
});

test('ensureMeridianTables is idempotent', () => {
  // Calling twice must not throw (CREATE TABLE IF NOT EXISTS).
  expect(() => {
    ensureMeridianTables();
    ensureMeridianTables();
  }).not.toThrow();
});

test('insert then find round-trips a market row', () => {
  insertMeridianMarket({ collectionId: '1001', ticker: 'AAPL', strike: 230, closeDate: DATE });
  const row = findMarketByStrike('AAPL', 230, DATE);
  expect(row).not.toBeNull();
  expect(row!.collection_id).toBe('1001');
  expect(row!.ticker).toBe('AAPL');
  expect(row!.strike).toBe(230);
  expect(row!.close_date).toBe(DATE);
  expect(row!.settled).toBe(0);
  expect(row!.settlement_outcome).toBeNull();
  expect(row!.created_at).toBeGreaterThan(0);
});

test('findMarketByStrike returns null for an unknown tuple', () => {
  expect(findMarketByStrike('TSLA', 99999, DATE)).toBeNull();
});

test('insert is idempotent on (ticker, strike, close_date) — INSERT OR IGNORE', () => {
  insertMeridianMarket({ collectionId: '2001', ticker: 'MSFT', strike: 420, closeDate: DATE });
  // Re-insert the SAME tuple with a DIFFERENT collection id: must be ignored,
  // leaving the original row untouched (this is what makes cron re-runs safe).
  insertMeridianMarket({ collectionId: '9999', ticker: 'MSFT', strike: 420, closeDate: DATE });
  const row = findMarketByStrike('MSFT', 420, DATE);
  expect(row!.collection_id).toBe('2001'); // original wins, no duplicate, no overwrite

  const all = listUnsettledForDate(DATE).filter((r) => r.ticker === 'MSFT' && r.strike === 420);
  expect(all.length).toBe(1);
});

test('listUnsettledForDate filters by date + settled flag, ordered by ticker/strike', () => {
  // Seed a second date that must NOT leak into DATE's results.
  insertMeridianMarket({ collectionId: '3001', ticker: 'NVDA', strike: 100, closeDate: OTHER_DATE });
  // Add two more for DATE so we can assert ordering (NVDA<TSLA, and strike asc).
  insertMeridianMarket({ collectionId: '4001', ticker: 'TSLA', strike: 300, closeDate: DATE });
  insertMeridianMarket({ collectionId: '4002', ticker: 'NVDA', strike: 110, closeDate: DATE });
  insertMeridianMarket({ collectionId: '4003', ticker: 'NVDA', strike: 100, closeDate: DATE });

  const rows = listUnsettledForDate(DATE);
  // None from OTHER_DATE.
  expect(rows.every((r) => r.close_date === DATE)).toBe(true);
  // All currently unsettled.
  expect(rows.every((r) => r.settled === 0)).toBe(true);
  // Ordered by (ticker, strike) ascending: AAPL, MSFT, NVDA(100), NVDA(110), TSLA.
  const order = rows.map((r) => `${r.ticker}:${r.strike}`);
  const sorted = [...order].sort();
  // ticker is the primary sort key; within NVDA, 100 before 110.
  expect(order).toEqual(sorted);
  const nvda = rows.filter((r) => r.ticker === 'NVDA').map((r) => r.strike);
  expect(nvda).toEqual([100, 110]);
});

test('markSettled flips the row to settled with outcome + price', () => {
  insertMeridianMarket({ collectionId: '5001', ticker: 'AMZN', strike: 200, closeDate: DATE });
  markSettled({ collectionId: '5001', outcome: 'yes', settlementPrice: 207.5 });

  const row = findMarketByStrike('AMZN', 200, DATE);
  expect(row!.settled).toBe(1);
  expect(row!.settlement_outcome).toBe('yes');
  expect(row!.settlement_price).toBe(207.5);
  expect(row!.settled_at).toBeGreaterThan(0);

  // A settled row drops out of the unsettled list.
  const unsettled = listUnsettledForDate(DATE).filter((r) => r.collection_id === '5001');
  expect(unsettled.length).toBe(0);
});

test('easternTradingDay honors a well-formed MERIDIAN_CLOSE_DATE override', () => {
  const prev = process.env.MERIDIAN_CLOSE_DATE;
  process.env.MERIDIAN_CLOSE_DATE = '2030-07-04';
  try {
    expect(easternTradingDay()).toBe('2030-07-04');
  } finally {
    if (prev === undefined) delete process.env.MERIDIAN_CLOSE_DATE;
    else process.env.MERIDIAN_CLOSE_DATE = prev;
  }
});

test('easternTradingDay ignores a malformed override and returns a real YYYY-MM-DD', () => {
  const prev = process.env.MERIDIAN_CLOSE_DATE;
  process.env.MERIDIAN_CLOSE_DATE = 'not-a-date';
  try {
    const day = easternTradingDay();
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/); // fell through to the real ET formatter
    expect(day).not.toBe('not-a-date');
  } finally {
    if (prev === undefined) delete process.env.MERIDIAN_CLOSE_DATE;
    else process.env.MERIDIAN_CLOSE_DATE = prev;
  }
});

test('easternTradingDay formats an explicit instant in US/Eastern', () => {
  const prev = process.env.MERIDIAN_CLOSE_DATE;
  delete process.env.MERIDIAN_CLOSE_DATE;
  try {
    // 2026-03-10T02:00:00Z is still 2026-03-09 in New York (pre-dawn EDT).
    expect(easternTradingDay(new Date('2026-03-10T02:00:00Z'))).toBe('2026-03-09');
  } finally {
    if (prev !== undefined) process.env.MERIDIAN_CLOSE_DATE = prev;
  }
});
