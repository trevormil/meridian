import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '../env.js';
import { migrate } from './schema.js';

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  mkdirSync(dirname(env.dbPath), { recursive: true });
  _db = new Database(env.dbPath);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  migrate(_db);
  // Clean up rows that landed before the camelCase fix — they have
  // collection_id='undefined' from String(undefined) in extractSummary.
  _db.exec("DELETE FROM markets WHERE collection_id = 'undefined' OR collection_id IS NULL");
  // If we have no markets but the bootstrap cursor has advanced, we likely
  // dropped a bad row. Reset the cursor so the next scan re-discovers it.
  const m = _db.query("SELECT COUNT(*) AS n FROM markets").get() as { n: number };
  if (m.n === 0) {
    _db.exec("DELETE FROM sync_state WHERE key = 'bootstrap.last_scanned_id'");
  }
  return _db;
}

export function getSyncState(key: string): string | null {
  const row = getDb().query('SELECT value FROM sync_state WHERE key = ?').get(key) as
    | { value: string }
    | null;
  return row?.value ?? null;
}

export function setSyncState(key: string, value: string): void {
  getDb()
    .query('INSERT INTO sync_state(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}
