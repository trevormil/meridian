import type { Database } from 'bun:sqlite';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS markets (
  collection_id        TEXT PRIMARY KEY,
  metadata_uri         TEXT,
  name                 TEXT,
  description          TEXT,
  image                TEXT,
  verifier_address     TEXT,
  deposit_denom        TEXT,
  deposit_amount       TEXT,
  mint_escrow_address  TEXT,
  pool_id              TEXT,
  status               TEXT,
  yes_price            REAL,
  no_price             REAL,
  total_deposited      TEXT,
  resolution_date      INTEGER,
  created_at           INTEGER NOT NULL,
  last_synced          INTEGER NOT NULL,
  raw_collection_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);

CREATE TABLE IF NOT EXISTS price_history (
  collection_id  TEXT NOT NULL,
  timeframe      TEXT NOT NULL,
  ts             INTEGER NOT NULL,
  yes_price      REAL NOT NULL,
  no_price       REAL NOT NULL,
  open           REAL,
  high           REAL,
  low            REAL,
  close          REAL,
  PRIMARY KEY (collection_id, timeframe, ts)
);

CREATE INDEX IF NOT EXISTS idx_price_history_collection_tf ON price_history(collection_id, timeframe, ts DESC);

CREATE TABLE IF NOT EXISTS intents (
  collection_id          TEXT NOT NULL,
  approval_level         TEXT NOT NULL,
  owner_address          TEXT NOT NULL,
  approval_id            TEXT NOT NULL,
  pay_denom              TEXT,
  receive_denom          TEXT,
  pay_amount             TEXT,
  receive_amount         TEXT,
  transfer_times_start   INTEGER,
  transfer_times_end     INTEGER,
  used                   INTEGER NOT NULL DEFAULT 0,
  is_active              INTEGER NOT NULL DEFAULT 1,
  last_synced            INTEGER NOT NULL,
  PRIMARY KEY (collection_id, approval_level, owner_address, approval_id)
);

CREATE INDEX IF NOT EXISTS idx_intents_collection ON intents(collection_id, is_active);
CREATE INDEX IF NOT EXISTS idx_intents_owner ON intents(owner_address, collection_id);

CREATE TABLE IF NOT EXISTS votes (
  collection_id     TEXT NOT NULL,
  approval_level    TEXT NOT NULL,
  approver_address  TEXT NOT NULL,
  approval_id       TEXT NOT NULL,
  proposal_id       TEXT NOT NULL,
  voter_address     TEXT NOT NULL,
  yes_weight        REAL NOT NULL,
  voter_weight      REAL NOT NULL,
  cast_at           INTEGER NOT NULL,
  PRIMARY KEY (collection_id, approval_level, approver_address, approval_id, proposal_id, voter_address)
);

CREATE TABLE IF NOT EXISTS sync_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
`;

export function migrate(db: Database): void {
  db.exec(SCHEMA_SQL);
  // Idempotent column adds for in-place upgrades. SQLite has no ADD COLUMN IF
  // NOT EXISTS, so we try/catch on "duplicate column" errors.
  const addCol = (table: string, col: string, type: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    } catch (e) {
      if (!/duplicate column/i.test((e as Error).message)) throw e;
    }
  };
  addCol('markets', 'mint_escrow_address', 'TEXT');
}
