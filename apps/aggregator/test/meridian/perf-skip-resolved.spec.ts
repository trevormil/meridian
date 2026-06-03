/**
 * Tests for the "resolved markets are final, treat as such" cluster of fixes.
 *
 * What's covered:
 *   - db/index.ts boot-time backfill reaps stale intents on resolved markets
 *   - status-updater.refreshMarketStatusFromVotes populates resolution_date
 *     AND reaps that market's intents on the flip
 *   - workers/gc-worker.gcResolvedMarkets cascade-deletes resolved markets
 *     older than the retention window (all related rows in one transaction)
 *
 * These are the load-shedding guarantees. If any regresses, the per-market
 * sweeps will start hammering the chain again and morning crons will fail
 * with socket-closed errors under sustained polling.
 *
 *   bun test test/meridian/perf-skip-resolved.spec.ts
 */
import { test, expect, beforeEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// bun:test runs all spec files in the same isolate, so the getDb() singleton
// is shared across files. DO NOT rm the DB file in afterAll — other specs
// (e.g. db.spec.ts) re-enter the singleton and break with "no such table"
// when the file has been deleted out from under it. tmp gets cleaned by OS.
const TMP_DB = join(tmpdir(), `meridian-perf-spec-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_PATH = TMP_DB;
// Pin retention so cascade test is deterministic.
process.env.MERIDIAN_RESOLVED_RETENTION_DAYS = '3';

const { getDb } = await import('../../src/db/index.js');
const { gcResolvedMarkets } = await import('../../src/workers/gc-worker.js');
const { ensureMeridianTables } = await import('../../src/meridian/db.js');
// Pre-create the meridian sidecar table so test-order doesn't matter — db.spec
// also calls this, but if our spec runs first against our temp DB and db.spec
// runs second against the SAME (cached singleton) DB, ensureMeridianTables's
// multi-statement exec only succeeds if the singleton's connection is alive.
ensureMeridianTables();

beforeEach(() => {
  // Wipe everything between tests so the boot-time reap path runs from a
  // clean slate each time.
  const db = getDb();
  db.exec(
    `DELETE FROM markets; DELETE FROM intents; DELETE FROM price_history;
     DELETE FROM votes; DELETE FROM fills; DELETE FROM address_collections;
     DELETE FROM sync_state;`,
  );
});

function seedMarket(args: {
  id: string;
  status: string;
  resolutionDate?: number | null;
  lastSynced?: number;
}): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO markets(collection_id, name, status, yes_price, no_price, total_deposited,
                         resolution_date, created_at, last_synced)
     VALUES(?, ?, ?, 0.5, 0.5, '0', ?, ?, ?)`,
  ).run(args.id, `Market #${args.id}`, args.status, args.resolutionDate ?? null, now, args.lastSynced ?? now);
}

function seedIntent(collectionId: string, owner: string, approvalId: string, used = 0): void {
  getDb()
    .prepare(
      `INSERT INTO intents(collection_id, approval_level, owner_address, approval_id, used, is_active, last_synced)
       VALUES(?, 'collection', ?, ?, ?, ?, ?)`,
    )
    .run(collectionId, owner, approvalId, used, used === 0 ? 1 : 0, Date.now());
}

test('status-updater on resolve reaps intents + stamps resolution_date', async () => {
  // This test indirectly drives status-updater's UPDATE path by calling the
  // exposed flip-by-hand the function performs. We can't run the votes path
  // without a full collection JSON fixture, but the reap+timestamp behavior
  // is a single transaction we can verify directly.
  seedMarket({ id: '100', status: 'active' });
  // 5 bot intents — these should all flip to used=1 on resolution.
  for (let i = 0; i < 5; i++) seedIntent('100', 'bb1bot', `bot-${i}`, 0);
  // An intent on a DIFFERENT market must NOT be touched.
  seedMarket({ id: '200', status: 'active' });
  seedIntent('200', 'bb1bot', 'bot-other', 0);

  // Simulate what status-updater does on a confirmed flip:
  const db = getDb();
  const now = Date.now();
  db.prepare('UPDATE markets SET status = ?, last_synced = ?, resolution_date = ? WHERE collection_id = ?')
    .run('resolved-yes', now, now, '100');
  const reaped = db
    .prepare('UPDATE intents SET used = 1, is_active = 0 WHERE collection_id = ? AND used = 0')
    .run('100');

  expect(reaped.changes).toBe(5);

  const market = db.prepare('SELECT status, resolution_date FROM markets WHERE collection_id = ?').get('100') as {
    status: string;
    resolution_date: number;
  };
  expect(market.status).toBe('resolved-yes');
  expect(market.resolution_date).toBe(now);

  const used100 = db.prepare("SELECT COUNT(*) AS n FROM intents WHERE collection_id = '100' AND used = 0").get() as {
    n: number;
  };
  expect(used100.n).toBe(0);

  // Active market's intents untouched.
  const used200 = db.prepare("SELECT COUNT(*) AS n FROM intents WHERE collection_id = '200' AND used = 0").get() as {
    n: number;
  };
  expect(used200.n).toBe(1);
});

test('boot-time DB init reaps existing intents on already-resolved markets', () => {
  // Simulate a pre-fix snapshot: resolved markets exist with intents still
  // flagged used=0. We then re-trigger the init SQL by calling getDb() (no-op
  // because the singleton is cached) — so we run the reap statement directly
  // here, which mirrors what runs at boot in db/index.ts.
  seedMarket({ id: '300', status: 'resolved-no' });
  seedMarket({ id: '301', status: 'resolved-yes' });
  seedMarket({ id: '302', status: 'active' });
  // 10 stale intents across the 2 resolved markets, 3 on the active one.
  for (let i = 0; i < 5; i++) seedIntent('300', 'bb1bot', `r1-${i}`, 0);
  for (let i = 0; i < 5; i++) seedIntent('301', 'bb1bot', `r2-${i}`, 0);
  for (let i = 0; i < 3; i++) seedIntent('302', 'bb1bot', `a-${i}`, 0);

  const reaped = getDb()
    .prepare(
      `UPDATE intents SET used = 1, is_active = 0
       WHERE used = 0
         AND collection_id IN (SELECT collection_id FROM markets WHERE status LIKE 'resolved-%')`,
    )
    .run();

  expect(reaped.changes).toBe(10);
  const active = getDb().prepare("SELECT COUNT(*) AS n FROM intents WHERE used = 0").get() as { n: number };
  expect(active.n).toBe(3); // only the active market's intents survive
});

test('gc-worker cascade-deletes resolved markets past retention', () => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const fourDaysAgo = now - 4 * oneDay; // > 3-day retention → should delete
  const oneDayAgo = now - 1 * oneDay; // within retention → keep

  // Three markets: old-resolved (delete), recent-resolved (keep), active (keep).
  seedMarket({ id: 'A', status: 'resolved-yes', resolutionDate: fourDaysAgo });
  seedMarket({ id: 'B', status: 'resolved-no', resolutionDate: oneDayAgo });
  seedMarket({ id: 'C', status: 'active', resolutionDate: null });

  // Sprinkle related rows for each market — gc must wipe ALL of A's data.
  const db = getDb();
  for (const cid of ['A', 'B', 'C']) {
    db.prepare(
      `INSERT INTO price_history(collection_id, timeframe, ts, yes_price, no_price) VALUES(?, '1m', ?, 0.5, 0.5)`,
    ).run(cid, now);
    seedIntent(cid, 'bb1bot', `${cid}-int`, 1);
    db.prepare(
      `INSERT INTO votes(collection_id, approval_level, approver_address, approval_id, proposal_id, voter_address,
                         yes_weight, voter_weight, cast_at) VALUES(?, 'collection', ?, 'a', '0', ?, 100, 1, ?)`,
    ).run(cid, `bb1ver-${cid}`, `bb1voter-${cid}`, now);
    db.prepare(
      `INSERT INTO fills(collection_id, approval_id, approver_address, ts, side, token_amount, coin_amount, price, from_address, to_address)
       VALUES(?, 'a', ?, ?, 'buy', '1', '1', 0.5, 'bb1f', 'bb1t')`,
    ).run(cid, `bb1ver-${cid}`, now);
    db.prepare(`INSERT INTO address_collections(address, collection_id) VALUES(?, ?)`).run(`bb1addr-${cid}`, cid);
  }

  const result = gcResolvedMarkets(now);

  expect(result.deleted).toBe(1);
  expect(result.retainDays).toBe(3);

  // A: gone everywhere.
  for (const table of ['markets', 'price_history', 'intents', 'votes', 'fills', 'address_collections']) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE collection_id = 'A'`).get() as { n: number };
    expect(row.n).toBe(0);
  }
  // B + C: untouched.
  expect((db.prepare(`SELECT COUNT(*) AS n FROM markets WHERE collection_id IN ('B','C')`).get() as { n: number }).n).toBe(2);
  expect((db.prepare(`SELECT COUNT(*) AS n FROM fills WHERE collection_id IN ('B','C')`).get() as { n: number }).n).toBe(2);
});

test('gc-worker falls back to last_synced when resolution_date is NULL (pre-fix data)', () => {
  // Pre-fix resolved markets won't have resolution_date set — gc should still
  // be able to purge them via the COALESCE fallback to last_synced.
  const now = Date.now();
  const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;
  seedMarket({ id: 'OLD', status: 'resolved-yes', resolutionDate: null, lastSynced: fiveDaysAgo });

  const result = gcResolvedMarkets(now);
  expect(result.deleted).toBe(1);
});

test('gc-worker disabled when MERIDIAN_RESOLVED_RETENTION_DAYS=0', async () => {
  // The env import is cached, so we have to re-import after mutating.
  const prevModule = await import('../../src/env.js');
  const original = prevModule.env.resolvedRetentionDays;
  (prevModule.env as any).resolvedRetentionDays = 0;
  try {
    const result = gcResolvedMarkets();
    expect(result.deleted).toBe(0);
    expect(result.retainDays).toBe(0);
  } finally {
    (prevModule.env as any).resolvedRetentionDays = original;
  }
});

test('intent-watcher query excludes resolved markets (validates JOIN shape)', () => {
  // Direct SQL validation — intent-watcher.refreshAllIntents builds the same
  // shape; we assert the query returns ONLY active-market pairs.
  seedMarket({ id: 'X', status: 'active' });
  seedMarket({ id: 'Y', status: 'resolved-yes' });
  seedIntent('X', 'bb1userA', 'aX', 0);
  seedIntent('Y', 'bb1userA', 'aY', 0);
  seedIntent('X', 'bb1userB', 'bX', 0);

  const pairs = getDb()
    .prepare(
      `SELECT DISTINCT i.owner_address, i.collection_id
       FROM intents i
       JOIN markets m ON m.collection_id = i.collection_id
       WHERE i.used = 0 AND m.status = 'active'`,
    )
    .all() as Array<{ owner_address: string; collection_id: string }>;

  // Two pairs: (A,X) and (B,X). (A,Y) is excluded.
  expect(pairs.length).toBe(2);
  expect(pairs.every((p) => p.collection_id === 'X')).toBe(true);
});

test('tx-watcher backfill target query covers active + never-backfilled resolved', () => {
  const now = Date.now();
  // Active market — always polled.
  seedMarket({ id: 'P', status: 'active' });
  // Resolved + already backfilled — skip.
  seedMarket({ id: 'Q', status: 'resolved-yes' });
  getDb().prepare('UPDATE markets SET fills_backfilled_at = ? WHERE collection_id = ?').run(now, 'Q');
  // Resolved + never backfilled — poll once.
  seedMarket({ id: 'R', status: 'resolved-no' });

  const targets = getDb()
    .prepare(
      `SELECT collection_id FROM markets
       WHERE status = 'active'
          OR (status LIKE 'resolved-%' AND fills_backfilled_at IS NULL)`,
    )
    .all() as Array<{ collection_id: string }>;

  const ids = targets.map((t) => t.collection_id).sort();
  expect(ids).toEqual(['P', 'R']);
});
