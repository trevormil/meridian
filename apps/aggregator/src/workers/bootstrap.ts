import { getDb, getSyncState, setSyncState } from '../db/index.js';
import { env } from '../env.js';
import { getCollection } from '../chain/lcd.js';
import { extractSummary, isPredictionMarket } from '../chain/classify.js';
import { publish, channel } from '../pubsub.js';
import { snapshotMarket, snapshotMarkets } from '../snapshots.js';
import { seedInitialCandles } from '../db/candles.js';

const SYNC_KEY = 'bootstrap.last_scanned_id';
const REFRESH_INTERVAL_MS = 15_000;

/**
 * Scan forward from the last successfully-indexed collection ID. Stops only
 * after a long tail of consecutive 404s (so we know we've hit the top of the
 * chain). Connection errors do NOT advance — we just back off and retry the
 * same ID, so a temporarily-down LCD doesn't make us skip live collections.
 */
export async function bootstrapScan(): Promise<{ scanned: number; found: number }> {
  const start = Number(getSyncState(SYNC_KEY) ?? '0') + 1;
  let scanned = 0;
  let found = 0;
  let lastFound = start - 1;
  let misses = 0;
  for (let id = start; id <= env.bootstrapMaxCollectionId; id++) {
    let c;
    try {
      c = await getCollection(String(id));
    } catch (err) {
      // Treat transport errors as transient — don't advance, don't persist.
      console.warn(`[bootstrap] transient error at id ${id}:`, (err as Error).message);
      return { scanned, found };
    }
    scanned++;
    if (!c) {
      misses++;
      if (misses > 50) {
        // Persist the last KNOWN-EXISTS id so the next scan picks up from there.
        setSyncState(SYNC_KEY, String(lastFound));
        return { scanned, found };
      }
      continue;
    }
    misses = 0;
    lastFound = id;
    if (isPredictionMarket(c) && !isHiddenTestMarket(c)) {
      upsertMarket(c);
      found++;
      console.log(`[bootstrap] indexed prediction market #${id}`);
    }
    setSyncState(SYNC_KEY, String(id));
  }
  setSyncState(SYNC_KEY, String(lastFound));
  return { scanned, found };
}

/**
 * Periodic forward-scan. Runs on a loop so new collections show up within a
 * cycle. Also catches the case where bootstrap was previously blocked by an
 * unreachable LCD — it will simply pick up where the last successful scan
 * left off.
 */
export function startBootstrapLoop(): NodeJS.Timer {
  bootstrapScan().catch((e) => console.error('[bootstrap] initial:', e));
  return setInterval(() => {
    bootstrapScan().catch((e) => console.error('[bootstrap] interval:', e));
  }, REFRESH_INTERVAL_MS);
}

/**
 * Markets whose name starts with `[E2E]` or whose description references a
 * far-future close date are artifacts of the Meridian e2e test suite (which
 * has to create real on-chain markets to exercise the full lifecycle). We
 * hide them from the aggregator's view so they don't pollute the FE.
 *
 * The markets can't be deleted on-chain — they just get skipped here at the
 * bootstrap-index boundary, which keeps the indexed `markets` table clean.
 */
function isHiddenTestMarket(c: any): boolean {
  // Name + description live in the parsed JSON inside `collectionMetadata.customData`
  // (the same field extractSummary unpacks). collectionMetadataTimeline is NOT
  // populated on the LCD response — that was the earlier bug.
  let name = '';
  let description = '';
  try {
    const raw = c?.collectionMetadata?.customData;
    if (raw) {
      const meta = JSON.parse(raw);
      name = String(meta?.name ?? '');
      description = String(meta?.description ?? '');
    }
  } catch {
    // unparseable customData — fall through to the false return below
  }
  if (name.startsWith('[E2E]') || name.startsWith('[TEST]')) return true;
  if (/\b209[0-9]-\d{2}-\d{2}\b/.test(description)) return true;
  return false;
}

export function upsertMarket(c: any): void {
  const s = extractSummary(c);
  const now = Date.now();
  const existing = getDb()
    .prepare('SELECT collection_id, created_at FROM markets WHERE collection_id = ?')
    .get(s.collectionId) as { collection_id: string; created_at: number } | undefined;
  const createdAt = existing?.created_at ?? now;
  const isNew = !existing;

  getDb()
    .prepare(
      `INSERT INTO markets(
         collection_id, metadata_uri, name, description, image,
         verifier_address, deposit_denom, deposit_amount, mint_escrow_address, pool_id,
         status, yes_price, no_price, total_deposited,
         created_at, last_synced, raw_collection_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0.5, 0.5, '0', ?, ?, ?)
       ON CONFLICT(collection_id) DO UPDATE SET
         metadata_uri = excluded.metadata_uri,
         name = excluded.name,
         description = excluded.description,
         image = excluded.image,
         verifier_address = excluded.verifier_address,
         deposit_denom = excluded.deposit_denom,
         deposit_amount = excluded.deposit_amount,
         mint_escrow_address = excluded.mint_escrow_address,
         pool_id = excluded.pool_id,
         last_synced = excluded.last_synced,
         raw_collection_json = excluded.raw_collection_json`,
    )
    .run(
      s.collectionId,
      s.metadataUri,
      s.name,
      s.description,
      s.image,
      s.verifierAddress,
      s.depositDenom,
      s.depositAmount,
      s.mintEscrowAddress,
      s.poolId,
      createdAt,
      now,
      JSON.stringify(c),
    );
  // Seed a 50/50 starting candle the FIRST time a market is indexed. The
  // chart then renders a flat line from creation forward without any
  // client-side anchor logic. `seedInitialCandles` uses INSERT OR IGNORE so
  // re-upserts of an existing market are safe.
  if (isNew) seedInitialCandles(s.collectionId, createdAt);

  // Broadcast: single-market update for /markets/{id} subscribers + full list
  // for browse-page subscribers. Cheap — the list query is bounded at 100.
  publish(channel.market(s.collectionId), snapshotMarket(s.collectionId));
  if (!existing) publish(channel.markets(), snapshotMarkets());
}
