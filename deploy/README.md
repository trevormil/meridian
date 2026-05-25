# Meridian — single-droplet deployment

One DigitalOcean droplet, Docker Compose, Caddy for TLS, host-managed
`bitbadgeschaind` + host crontab for the daily lifecycle.

## What goes where

| Component | Where | Why |
|---|---|---|
| `bitbadgeschaind` | host (systemd) | Cosmos nodes are stateful + IO-heavy; should not share a container restart cycle with the app |
| `aggregator` | Compose | bundled with seeder + arb bot |
| `web` | Compose | stateless Next.js prod build |
| `caddy` | Compose | terminates TLS for 4 subdomains via Let's Encrypt |
| `meridian:morning` / `meridian:evening` / `meridian:bootstrap` | host crontab | one-shot daily; run inside the aggregator container via `docker compose exec` |
| Mnemonics (oracle/faucet/bot) | `/etc/meridian/fixtures` (mode 0700) | mounted read-only into aggregator |

## One-time bootstrap

```bash
# 1. Spin up droplet — Ubuntu 24.04 LTS, 4 GB RAM minimum.

# 2. Set the system timezone so cron + the morning/evening scripts agree.
sudo timedatectl set-timezone America/New_York

# 3. Install Docker + Compose plugin.
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 4. Build + install bitbadgeschaind from source (or copy a pre-built binary).
git clone https://github.com/bitbadges/bitbadgeschain /opt/bitbadgeschain
cd /opt/bitbadgeschain && make install
# Initialize the chain — same flow as `cr` locally but without ignite.
bitbadgeschaind init meridian-prod --chain-id bitbadges-1
# Seed accounts (oracle, faucet, bot, etc) per config.yml in the repo.
# See bitbadgeschain/config.yml for the canonical seed list.

# 5. systemd unit for the chain.
sudo tee /etc/systemd/system/bitbadgeschain.service <<'EOF'
[Unit]
Description=BitBadges chain node
After=network.target
[Service]
Type=simple
User=ubuntu
ExecStart=/root/go/bin/bitbadgeschaind start
Restart=always
RestartSec=5
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now bitbadgeschain

# 6. Clone the app repo.
sudo mkdir -p /opt/bitbadges-pm && sudo chown $USER /opt/bitbadges-pm
git clone https://github.com/bitbadges/bitbadges-pm /opt/bitbadges-pm
cd /opt/bitbadges-pm

# 7. Drop the three mnemonic fixtures (NEVER commit these — they sign txs).
sudo mkdir -p /etc/meridian/fixtures
sudo chmod 700 /etc/meridian/fixtures
sudo cp ~/oracle.json /etc/meridian/fixtures/   # generated via bitbadgeschaind keys add
sudo cp ~/faucet.json /etc/meridian/fixtures/
sudo cp ~/bot.json    /etc/meridian/fixtures/

# 8. Configure compose env.
cp deploy/.env.example deploy/.env
$EDITOR deploy/.env   # set DOMAIN_*, ACME_EMAIL

# 9. Point DNS A records at the droplet:
#      meridian.example.com         → <droplet IP>
#      api.meridian.example.com     → <droplet IP>
#      lcd.meridian.example.com     → <droplet IP>
#      rpc.meridian.example.com     → <droplet IP>

# 10. Build + start the stack. Caddy auto-provisions TLS.
cd deploy
docker compose --env-file .env up -d --build

# 11. Install the host crontab for the daily lifecycle scripts.
sudo mkdir -p /var/log/meridian && sudo chown $USER /var/log/meridian
crontab deploy/crontab.example
```

## Verify

```bash
# Stack health
curl https://api.meridian.example.com/health      # → {ok:true, ...}
curl https://lcd.meridian.example.com/cosmos/base/tendermint/v1beta1/blocks/latest
# Open https://meridian.example.com in a browser.

# Cron dry-run (no chain mutation)
docker compose exec aggregator bun run meridian:morning   # 45 markets created if first call of the day
docker compose exec aggregator bun run meridian:evening   # idempotent if already settled

# Tail logs
docker compose logs -f aggregator | grep meridian
tail -f /var/log/meridian/morning.log
```

## Operations

**Update the app:**
```bash
cd /opt/bitbadges-pm
git pull
cd deploy && docker compose --env-file .env up -d --build aggregator web
```

**Update the chain:** rebuild `bitbadgeschaind`, then `sudo systemctl restart bitbadgeschain`. The aggregator's tx-watcher will auto-reconnect to the chain's WS.

**Enable the Explorer node-logs tail (optional):** the `/explorer` tab shows a
live `journalctl` tail when the host ships the chain's logs to a file the
aggregator bind-mounts read-only. The aggregator already mounts
`${CHAIN_LOG_DIR:-/var/log/bitbadges}` → `/host-logs:ro` and reads
`/host-logs/chain.log`; until the file exists the endpoint returns
`mounted:false` and the UI shows a graceful empty state. To turn it on:

```bash
sudo mkdir -p /var/log/bitbadges
# Ship the chain unit's journal to a file (one-shot service):
sudo tee /etc/systemd/system/bitbadges-logship.service >/dev/null <<'EOF'
[Unit]
Description=Tail bitbadgeschain journal to a file for the Meridian Explorer
After=bitbadgeschain.service
[Service]
ExecStart=/bin/sh -c 'journalctl -f -n 0 -u bitbadgeschain -o cat >> /var/log/bitbadges/chain.log'
Restart=always
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now bitbadges-logship
# Cap growth (logrotate):
echo '/var/log/bitbadges/chain.log { size 50M rotate 2 missingok copytruncate }' | sudo tee /etc/logrotate.d/bitbadges
# Recreate the aggregator so the bind-mount picks up the now-present dir:
cd /opt/bitbadges-pm/deploy && docker compose up -d aggregator
```

> ⚠️ **The node logs become publicly viewable** at `/explorer` once enabled.
> This is intentional transparency on a **devnet with no real funds** — the
> endpoint is tail-only (≤500 lines) and read-only. Do NOT enable this verbatim
> on a chain holding real value without scrubbing/authenticating it first.

**Backup:** snapshot the droplet weekly. Critical state:
- `/etc/meridian/fixtures/*.json`  — mnemonics (without these the oracle can't settle)
- `/root/.bitbadgeschain/data/`     — chain data
- Docker volume `meridian_aggregator-data` — SQLite + WAL

```bash
# Manual backup
sudo tar czf /tmp/meridian-backup-$(date +%F).tar.gz \
  /etc/meridian/fixtures \
  /root/.bitbadgeschain/data \
  $(docker volume inspect meridian_aggregator-data -f '{{.Mountpoint}}')
```

**Rotate the oracle key:**
1. `bitbadgeschaind keys add oracle-new --keyring-backend test --output json`
2. Send a small BADGE drip from the bot to the new address to register it.
3. Update `markets.verifier_address` on chain via a chain governance proposal (or accept that the new oracle can only settle NEW markets going forward — old markets stay tied to the original verifier).
4. Replace `/etc/meridian/fixtures/oracle.json`.
5. `docker compose restart aggregator`.

## Why not k8s here

For one stateful component (chain), one stateful sidecar (aggregator + SQLite),
one stateless FE, and two daily one-shot scripts — k8s adds operational
weight without a load you can't already serve on a single 4 GB box. If you
later need horizontal scaling, geographic redundancy, or per-component
deploy isolation, migrate the FE first (it's stateless), then the
aggregator (PVC + RWO), and only touch the chain if you stand up a real
validator set.

## Cost reference (DO, 2026)

| Item | Spec | Monthly |
|---|---|---|
| Droplet | 4 GB / 2 vCPU / 80 GB SSD (basic regular) | ~$24 |
| Backups (DO weekly snapshots) | 20% of droplet | ~$5 |
| Bandwidth | included up to 4 TB | $0 |
| **Total** | | **~$29** |
