import { getDb } from '../db/index.js';
import type { Ticker } from './constants.js';

/**
 * Sidecar table tracking which on-chain prediction-market collection each
 * Meridian strike maps to. Lets the evening settle script find the markets
 * it needs to vote on without scanning every collection on chain.
 *
 *   collection_id  — bigint as string, primary key (matches markets.collection_id)
 *   ticker         — 'AAPL' | 'MSFT' | ...
 *   strike         — integer dollars
 *   close_date     — 'YYYY-MM-DD' in US/Eastern (the trading day)
 *   settled        — 0/1
 *   settlement_*   — populated by the evening script when the vote casts
 *
 * Each (ticker, strike, close_date) tuple gets at most one row — the morning
 * script no-ops on re-run so cron retries are safe.
 */
export function ensureMeridianTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS meridian_markets (
      collection_id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      strike INTEGER NOT NULL,
      close_date TEXT NOT NULL,
      settled INTEGER NOT NULL DEFAULT 0,
      settlement_price REAL,
      settlement_outcome TEXT,
      created_at INTEGER NOT NULL,
      settled_at INTEGER,
      UNIQUE (ticker, strike, close_date)
    );
    CREATE INDEX IF NOT EXISTS idx_meridian_close_date ON meridian_markets(close_date);
    CREATE INDEX IF NOT EXISTS idx_meridian_settled ON meridian_markets(settled);
  `);
}

export interface MeridianRow {
  collection_id: string;
  ticker: Ticker;
  strike: number;
  close_date: string;
  settled: number;
  settlement_price: number | null;
  settlement_outcome: 'yes' | 'no' | null;
  created_at: number;
  settled_at: number | null;
}

export function findMarketByStrike(ticker: Ticker, strike: number, closeDate: string): MeridianRow | null {
  ensureMeridianTables();
  return (
    getDb()
      .prepare(
        `SELECT * FROM meridian_markets WHERE ticker = ? AND strike = ? AND close_date = ?`,
      )
      .get(ticker, strike, closeDate) as MeridianRow | null
  );
}

export function listUnsettledForDate(closeDate: string): MeridianRow[] {
  ensureMeridianTables();
  return getDb()
    .prepare('SELECT * FROM meridian_markets WHERE close_date = ? AND settled = 0 ORDER BY ticker, strike')
    .all(closeDate) as MeridianRow[];
}

export function insertMeridianMarket(row: {
  collectionId: string;
  ticker: Ticker;
  strike: number;
  closeDate: string;
}): void {
  ensureMeridianTables();
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO meridian_markets
         (collection_id, ticker, strike, close_date, settled, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    )
    .run(row.collectionId, row.ticker, row.strike, row.closeDate, Date.now());
}

export function markSettled(row: {
  collectionId: string;
  outcome: 'yes' | 'no';
  settlementPrice: number;
}): void {
  ensureMeridianTables();
  getDb()
    .prepare(
      `UPDATE meridian_markets
         SET settled = 1, settlement_outcome = ?, settlement_price = ?, settled_at = ?
       WHERE collection_id = ?`,
    )
    .run(row.outcome, row.settlementPrice, Date.now(), row.collectionId);
}

/** Returns 'YYYY-MM-DD' for the US/Eastern calendar day of `at` (default now).
 *  Tests can pin a specific date via the MERIDIAN_CLOSE_DATE env var so they
 *  don't collide with the real day's markets. */
export function easternTradingDay(at: Date = new Date()): string {
  const override = process.env.MERIDIAN_CLOSE_DATE;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(at);
}
