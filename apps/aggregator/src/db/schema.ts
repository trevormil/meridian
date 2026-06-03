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
  -- Lifetime traded volume in USDC base units. Sum of every fill's coin_amount,
  -- monotonically increasing. Distinct from total_deposited (escrow), which
  -- decreases as winners redeem after settle.
  total_volume         TEXT NOT NULL DEFAULT '0',
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

CREATE TABLE IF NOT EXISTS fills (
  -- One row per usedApprovalDetails event. PK is (collection, approval_id,
  -- approver) — Meridian intents all set afterOneUse:true so each approval
  -- fills at most once. Makes backfill replays idempotent.
  collection_id    TEXT NOT NULL,
  approval_id      TEXT NOT NULL,
  approver_address TEXT NOT NULL,
  ts               INTEGER NOT NULL,
  side             TEXT NOT NULL,
  token_amount     TEXT NOT NULL,
  coin_amount      TEXT NOT NULL,
  price            REAL NOT NULL,
  from_address     TEXT NOT NULL,
  to_address       TEXT NOT NULL,
  PRIMARY KEY (collection_id, approval_id, approver_address)
);
CREATE INDEX IF NOT EXISTS idx_fills_collection_ts ON fills(collection_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_fills_from ON fills(from_address, ts DESC);
CREATE INDEX IF NOT EXISTS idx_fills_to ON fills(to_address, ts DESC);

CREATE TABLE IF NOT EXISTS address_collections (
  -- Which markets an address has had ANY token transfer in (mint, fill,
  -- redeem). Used to NARROW the portfolio positions scan: instead of querying
  -- every market's balance store (~0.9s each on this node), we live-query only
  -- the few markets an address has touched. Balances themselves are NOT stored
  -- here — they're always read live from chain, so positions are never stale.
  -- Populated from tokenization MsgTransferTokens events (live + the 30s
  -- backfill re-scan, which makes this self-healing/complete).
  address       TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  PRIMARY KEY (address, collection_id)
);
CREATE INDEX IF NOT EXISTS idx_addrcol_address ON address_collections(address);

CREATE TABLE IF NOT EXISTS uploads (
  -- User-uploaded images for market creation. FE POSTs base64, we materialize,
  -- return a URL the FE writes into the markets on-chain image field.
  id          TEXT PRIMARY KEY,
  mime        TEXT NOT NULL,
  bytes       BLOB NOT NULL,
  size        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  created_by  TEXT
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
  // Per-market gate so the tx-watcher backfill skips resolved markets it has
  // already fully indexed. NULL = never backfilled (always run); INTEGER =
  // wall-clock ms of last successful backfill. Active markets re-run regardless.
  addCol('markets', 'fills_backfilled_at', 'INTEGER');
}
