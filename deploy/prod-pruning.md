# Production pruning runbook

The chain ships with `ignite chain serve` development defaults — fast blocks,
no pruning, full tx index forever. Fine for a laptop devnet, ruinous for a
long-running prod node. This runbook gives the chain a leaner profile for
single-droplet prod:

- **Slower blocks** so storage growth is bounded (250 ms → 1.5 s)
- **Pruning enabled** so the IAVL state DB doesn't grow forever
- **Bounded blockstore** so old blocks roll out of disk after ~2h
- **ABCI responses discarded** so each block in the store is ~half the size
- **Tx index kept** — the aggregator's restart-backfill path uses Tendermint's
  `/tx_search` for the ~30s window between aggregator down and back up

## Storage / growth profile (after applying)

Measured against the live deploy (`meridian.trevormil.com`) running 49 markets
+ seeder + arb bot:

| Component | Steady-state | Daily growth | 1-year size |
|---|---|---|---|
| `blockstore.db` | 5–15 MB | bounded by `min-retain-blocks` | constant |
| `state.db` | 50–100 MB | bounded by `pruning-keep-recent` | constant |
| `application.db` | 45 MB, grows | ~5–10 MB | ~3–4 GB |
| `tx_index.db` | 0, grows | ~20–30 MB | ~8–10 GB |
| `cs.wal` | ~17 MB | bounded (Tendermint rotates) | constant |
| **Aggregator SQLite** | grows | ~1–2 MB | ~500 MB–1 GB |
| **Chain total** | | ~25–40 MB/day | ~12–15 GB |

A 4 GB / 80 GB droplet ($24/mo) sustains this for ~6 years at the current
growth rate before disk pressure. RAM working set ~2.0–2.5 GB.

## What to change

Two config files live at `/root/.bitbadgeschain/config/`. The defaults below
are what `ignite chain init` produces; the prod columns are what we set.

### `config.toml` (Tendermint / CometBFT)

| Setting | Default | Prod | Why |
|---|---|---|---|
| `timeout_commit` | `"250ms"` | `"1500ms"` | 6x fewer blocks/day → 6x less blockstore growth |
| `create_empty_blocks_interval` | `"0s"` | `"10s"` | Don't write empty blocks more than every 10s |
| `discard_abci_responses` (under `[storage]`) | `false` | `true` | Drops the ABCI response payload from blockstore — ~half the per-block size |
| `[tx_index] indexer` | `"kv"` | `"kv"` (unchanged) | Keep ON — aggregator's tx-watcher uses `/tx_search` for restart backfill |

### `app.toml` (Cosmos SDK)

| Setting | Default | Prod | Why |
|---|---|---|---|
| `pruning` | `"default"` | `"custom"` | Enable explicit knobs |
| `pruning-keep-recent` | `"0"` | `"100"` | Keep last 100 IAVL state versions (~2–3 min at 1.5s blocks) |
| `pruning-interval` | `"0"` | `"100"` | Run pruner every 100 blocks |
| `min-retain-blocks` | `0` | `5000` | Keep last 5000 blocks (~2h) in blockstore; older ones drop |
| `[state-sync] snapshot-interval` | `0` | `0` (unchanged) | No snapshots — single-node, no peers to serve |

## Apply (idempotent)

Run as root on the droplet. The script handles both the first-time apply and
re-apply (sed targets only change lines that still hold the default).

```bash
#!/usr/bin/env bash
set -euo pipefail

systemctl stop bitbadgeschain
sleep 2

CFG=/root/.bitbadgeschain/config/config.toml
APP=/root/.bitbadgeschain/config/app.toml

# config.toml — consensus + storage
sed -i 's|^timeout_commit = "250ms"|timeout_commit = "1500ms"|' "$CFG"
sed -i 's|^create_empty_blocks_interval = "0s"|create_empty_blocks_interval = "10s"|' "$CFG"
if grep -q "^discard_abci_responses" "$CFG"; then
  sed -i 's|^discard_abci_responses = false|discard_abci_responses = true|' "$CFG"
else
  sed -i '/^\[storage\]/a discard_abci_responses = true' "$CFG"
fi

# app.toml — pruning
sed -i 's|^pruning = "default"|pruning = "custom"|' "$APP"
sed -i 's|^pruning-keep-recent = "0"|pruning-keep-recent = "100"|' "$APP"
sed -i 's|^pruning-interval = "0"|pruning-interval = "100"|' "$APP"
sed -i 's|^min-retain-blocks = 0|min-retain-blocks = 5000|' "$APP"

systemctl start bitbadgeschain
```

## Reclaim existing on-disk growth

Pruning only affects forward growth. To reclaim the indexed-history bloat that
accumulated before pruning was enabled:

```bash
systemctl stop bitbadgeschain
du -sh /root/.bitbadgeschain/data/tx_index.db     # report freed space
rm -rf /root/.bitbadgeschain/data/tx_index.db
systemctl start bitbadgeschain
```

**Loss**: only the historical tx index — `bitbadgeschaind tx query <hash>` will
return "not found" for txs that landed before this. The aggregator's REST +
WebSocket history is unaffected (it's in SQLite). Live tx ingest continues
normally; the index rebuilds forward from boot height.

The `application.db` and `state.db` will shrink on their own as the pruner
runs (`pruning-interval = 100` blocks ≈ every 2–3 min).

## Verify

```bash
# Block time — should average 1.5–1.7s
curl -s http://localhost:26657/blockchain | jq -r '.result.block_metas[:5][] | "\(.header.height) \(.header.time)"'

# Pruning settings effective
grep -E "^pruning|^min-retain-blocks" /root/.bitbadgeschain/config/app.toml

# Storage breakdown
du -sh /root/.bitbadgeschain/data/*
```

## When to revisit

- **state.db grows past 200 MB**: lower `pruning-keep-recent` to 50.
- **tx_index.db grows past 5 GB**: either (a) accept it (still <10% of disk),
  (b) periodically rotate via the `rm` recipe above, or (c) flip
  `indexer = "null"` and accept that the aggregator's `/tx_search` backfill
  path breaks on restart (it'd silently miss txs in the down-window — at our
  ~3-5s restart, that's typically zero txs).
- **Disk past 80%**: scale to the next droplet tier (`s-2vcpu-8gb-160gb-intel`,
  ~$56/mo) — doubles RAM + 2x disk, same cores.
