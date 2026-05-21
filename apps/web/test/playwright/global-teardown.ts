import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const AGG_DATA_DIR = resolve(__dirname, '../../../aggregator/data-playwright');

export default async function globalTeardown(): Promise<void> {
  const pidFile = resolve(AGG_DATA_DIR, 'agg.pid');
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8'));
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
  // Leave the SQLite around for post-mortem; only the WAL gets removed.
  rmSync(resolve(AGG_DATA_DIR, 'aggregator.sqlite-wal'), { force: true });
  rmSync(resolve(AGG_DATA_DIR, 'aggregator.sqlite-shm'), { force: true });
}
