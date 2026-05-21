/**
 * Clear the bootstrap + price-poller cursors so the next boot re-scans every
 * collection from id 1 and re-snapshots prices from the current chain head.
 * Keeps `markets`, `price_history`, `intents`, `votes` rows intact — only the
 * sync_state cursors are dropped. Use `bun run wipe` for a full reset.
 */
import { getDb } from '../db/index.js';

const db = getDb();
const before = db.query('SELECT key, value FROM sync_state').all() as Array<{ key: string; value: string }>;
console.log('Cursors before:', before);

db.exec('DELETE FROM sync_state');
console.log('All sync_state cursors cleared.');
console.log('Next boot will re-scan from id 1 and re-snapshot prices from chain head.');
process.exit(0);
