---
title: Bump chain block time (timeout_commit) on the host
anchor: tcb
last-verified: 2026-06-03
---

The chain's `timeout_commit` controls how long Tendermint waits after a block
is committed before proposing the next one. Default `1s` produces ~1 block/s,
which is overkill for Meridian's one-cron-twice-a-day workload and burns CPU
on consensus chatter that no one needs.

Bumping to `4s` cuts the chain's steady-state block-production CPU work by
~75% with **zero application impact** — Meridian's daily cron broadcasts a
few dozen txs that all finalize within a single block at either cadence.

## [1] Apply on the host (no docker, no app restart)

```bash
ssh root@<droplet>
# 1) Stop the chain so we can edit config.toml cleanly.
sudo systemctl stop bitbadgeschain

# 2) Edit consensus timeout_commit. Default block sits at the [consensus] section.
sudo sed -i.bak 's/^timeout_commit = .*/timeout_commit = "4s"/' \
  ~/.bitbadgeschain/config/config.toml

# Verify:
grep -n timeout_commit ~/.bitbadgeschain/config/config.toml
# → timeout_commit = "4s"

# 3) Bring it back up.
sudo systemctl start bitbadgeschain

# 4) Confirm new block cadence (expect ~4s between heights).
for i in 1 2 3 4 5; do
  curl -s http://localhost:26657/status | jq -r '.result.sync_info | "\(.latest_block_time) \(.latest_block_height)"'
  sleep 1
done
```

## [2] What it does NOT affect

- **Tx finality** — txs still commit in the next block, just 4s later instead
  of 1s. Cron scripts are insensitive to this; user-facing trades incur up to
  3s extra latency, which on a devnet is fine.
- **Indexing** — aggregator workers (`price-poller`, `tx-watcher`) are
  block-gated and adapt automatically.
- **Persistence** — no chain reset needed, no state migration. Reversible at
  any time (set back to `1s`, restart).

## [3] When to revert

If you ever turn on a high-frequency trading bot that genuinely needs sub-4s
fill latency. Until then, `4s` is the right default for this workload.
