---
title: Redeploy Meridian from scratch
anchor: rdpl
last-verified: 2026-06-03
---

End-to-end recipe for taking Meridian from a cold start — fresh droplet, no
chain, no DB — to a fully-running stack with the daily lifecycle firing. Use
this when re-spinning up after the droplet has been deprecated for cost.

Cross-references the existing deploy artifacts rather than duplicating them:

- `deploy/README.md` — long-form ops doc (one-time bootstrap, updates, backups)
- `deploy/docker-compose.yml` — service definitions
- `deploy/Caddyfile` — TLS + CORS at the edge (the CORS shape matters — §5.3)
- `deploy/.env.example` — env contract
- `deploy/crontab.example` — host crontab
- `apps/aggregator/src/meridian/` — morning/evening/bootstrap scripts
- `CLAUDE.md` — system architecture overview

## [1] Before deprecating the droplet — what to preserve

The chain is a **local devnet with no real funds**, so chain state and
SQLite are *recoverable* (just re-genesis + re-bootstrap). What is NOT
recoverable without backups:

### [1.1] Must preserve (irreplaceable)

| Artifact | Where | Why |
|---|---|---|
| `oracle.json` (mnemonic) | `/etc/meridian/fixtures/oracle.json` on the droplet | Designated verifier on every Meridian market. A new oracle key can only settle markets created *after* it's seeded — old markets are tied to the original address forever. Lose this and the existing market history can never be settled. |
| `bot.json` (mnemonic) | `/etc/meridian/fixtures/bot.json` | Seeder + arbitrage bot + funder for the oracle drip. Recreatable but means re-genesis. |
| `faucet.json` (mnemonic) | `/etc/meridian/fixtures/faucet.json` | FE testnet faucet account. Recreatable. |
| DNS records | Your registrar | The 4 subdomains (`meridian.`, `api.`, `lcd.`, `rpc.`). Saves a TTL wait when re-spinning. |
| Domain config | `deploy/.env` content | Same domains + ACME_EMAIL — also fine to recreate from `.env.example`. |

### [1.2] Nice-to-have (saves re-bootstrap time)

- Latest `bitbadgeschain` commit/branch you were running (note it in this
  doc when you deprecate). Working tree was last on
  `chore/disable-protocol-fee-local` per `CLAUDE.md`.
- Last known good `aggregator-data` Docker volume (`/var/lib/docker/volumes/meridian_aggregator-data/_data/aggregator.sqlite`). Speeds up
  market-history continuity if you also preserve chain data. **Drop it if
  you're re-genesising the chain** — collection IDs won't line up.

### [1.3] Preservation one-liner

```bash
# Run on the droplet BEFORE you destroy it. Pulls down a single tarball
# with everything irreplaceable plus a snapshot of the live SQLite.
sudo tar czf /tmp/meridian-preserve-$(date +%F).tar.gz \
  /etc/meridian/fixtures \
  $(docker volume inspect meridian_aggregator-data -f '{{.Mountpoint}}') \
  /opt/bitbadges-pm/deploy/.env
# Then scp it off the box:
scp root@<droplet>:/tmp/meridian-preserve-*.tar.gz ~/Backups/meridian/
```

## [2] Prerequisites for the redeploy

- Fresh Ubuntu 24.04 LTS droplet — **4 GB RAM / 2 vCPU / 80 GB SSD** (per
  `deploy/README.md` cost table; chain + aggregator + bot together pin
  ~1.5 GB resident, headroom needed for compose rebuild).
- 4 subdomains pointable at the droplet IP. Decide them up front; they're
  baked into the Next.js bundle at build time:
  - `meridian.<your-domain>` — FE
  - `api.<your-domain>` — aggregator REST + WS
  - `lcd.<your-domain>` — chain LCD (Cosmos REST, port 1317)
  - `rpc.<your-domain>` — chain RPC (Tendermint, port 26657)
- The preservation tarball from [1.3] available somewhere you can `scp` from.
- GitHub access for `bitbadges/bitbadgeschain` + `bitbadges/bitbadges-pm`.

## [3] Host setup

### [3.1] Timezone — set this first

The morning/evening scripts compute `easternTradingDay()` based on the
process clock. The host cron schedule (`deploy/crontab.example`) is written
in ET wall-clock. If the system clock is UTC, the 8 AM cron fires at 3 AM ET
and DST shifts it twice a year.

```bash
sudo timedatectl set-timezone America/New_York
timedatectl   # confirm
```

### [3.2] Docker + Compose

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version   # confirm v2 plugin present
```

### [3.3] Build the chain binary

```bash
# Clone the chain. Use the branch you were running before — at the time
# of writing, that's the working tree of `chore/disable-protocol-fee-local`
# (PR #99). If that has merged to main since, use main.
sudo mkdir -p /opt/bitbadgeschain && sudo chown $USER /opt/bitbadgeschain
git clone https://github.com/bitbadges/bitbadgeschain /opt/bitbadgeschain
cd /opt/bitbadgeschain
git checkout chore/disable-protocol-fee-local   # or main if merged
make install   # installs `bitbadgeschaind` into ~/go/bin/

bitbadgeschaind version   # confirm
```

### [3.4] Init the chain + seed accounts

The chain's `config.yml` is the source of truth for seeded genesis accounts
(`oracle`, `bot`, `faucet`, `e2e-alice`, `e2e-bob`, the `keplr*` set, etc).

```bash
bitbadgeschaind init meridian-prod --chain-id bitbadges-1

# Restore the preserved keys (preserves their addresses across re-genesis).
# `keys add --recover` will prompt for the mnemonic.
bitbadgeschaind keys add oracle --keyring-backend test --recover
bitbadgeschaind keys add bot    --keyring-backend test --recover
bitbadgeschaind keys add faucet --keyring-backend test --recover
# Confirm addresses match the preserved JSON files:
bitbadgeschaind keys list --keyring-backend test --output json | jq '.[] | {name, address}'
```

Then either re-genesis from `config.yml` (preferred — bakes the balances in
deterministically) or `add-genesis-account` each address manually with
matching balances. Refer to `bitbadgeschain/config.yml` in that repo for the
canonical seed list and amounts.

### [3.5] Run the chain as systemd

```bash
sudo tee /etc/systemd/system/bitbadgeschain.service <<EOF
[Unit]
Description=BitBadges chain node
After=network.target
[Service]
Type=simple
User=$USER
ExecStart=$HOME/go/bin/bitbadgeschaind start
Restart=always
RestartSec=5
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now bitbadgeschain

# Confirm — LCD on 1317, RPC on 26657
curl -s http://localhost:1317/cosmos/base/tendermint/v1beta1/blocks/latest | jq .block.header.height
curl -s http://localhost:26657/status | jq .result.sync_info.latest_block_height
```

## [4] Restore fixtures + clone the app

### [4.1] Drop the preserved fixtures back in

```bash
sudo mkdir -p /etc/meridian/fixtures
sudo chmod 700 /etc/meridian/fixtures
# From the preservation tarball:
sudo tar xzf ~/meridian-preserve-*.tar.gz -C /tmp
sudo cp /tmp/etc/meridian/fixtures/*.json /etc/meridian/fixtures/
sudo chmod 600 /etc/meridian/fixtures/*.json
ls -la /etc/meridian/fixtures/   # expect oracle.json, bot.json, faucet.json
```

Each fixture is shaped:
```json
{ "name": "oracle", "address": "bb1teqphl72qc32xy95m3jvnkdv78lvwn096yewjl", "mnemonic": "..." }
```
If you only have the mnemonics (no JSON), regenerate the wrapping JSON
from `bitbadgeschaind keys show <name> -a --keyring-backend test`.

### [4.2] Clone the app

```bash
sudo mkdir -p /opt/bitbadges-pm && sudo chown $USER /opt/bitbadges-pm
git clone https://github.com/bitbadges/bitbadges-pm /opt/bitbadges-pm
cd /opt/bitbadges-pm
```

### [4.3] Configure deploy/.env

```bash
cp deploy/.env.example deploy/.env
$EDITOR deploy/.env
```

Required values (from `deploy/.env.example` — full list there):

```env
DOMAIN_WEB=meridian.<your-domain>
DOMAIN_API=api.<your-domain>
DOMAIN_CHAIN_LCD=lcd.<your-domain>
DOMAIN_CHAIN_RPC=rpc.<your-domain>
ACME_EMAIL=you@example.com

# Internal chain endpoints — leave at host.docker.internal:*. Don't point
# these at the public subdomains; the aggregator would round-trip every
# poll through Caddy.
CHAIN_LCD_URL=http://host.docker.internal:1317
CHAIN_RPC_URL=http://host.docker.internal:26657
CHAIN_WS_URL=ws://host.docker.internal:26657/websocket

FIXTURES_DIR=/etc/meridian/fixtures
```

## [5] DNS, compose, Caddy

### [5.1] Point DNS

Four `A` records at the droplet IP — must resolve **before** the first
`docker compose up`, since Caddy provisions Let's Encrypt certs on startup
via HTTP-01 challenge (port 80 must be reachable from the public internet
on each subdomain).

### [5.2] Bring the stack up

```bash
cd /opt/bitbadges-pm/deploy
docker compose --env-file .env up -d --build
docker compose ps   # all three: aggregator (healthy), web, caddy
docker compose logs caddy | grep -i "certificate obtained"   # 4 obtains
```

### [5.3] Verify CORS at the edge

Past incident: the aggregator's `hono/cors` was the only CORS source, so
when the aggregator hung or restarted, Caddy generated a 502 *without*
CORS headers and the browser blamed CORS for an upstream failure. The
fix lives in `deploy/Caddyfile` lines 49-77 — `defer`'d header so it
overrides the upstream (no duplicates), plus `handle_errors` re-emits
CORS on Caddy-generated 5xx.

Confirm the shape:

```bash
# Healthy upstream — one ACAO header
curl -sI https://api.<your-domain>/health | grep -i access-control
# → Access-Control-Allow-Origin: *  (exactly one line)

# Stopped upstream — still one ACAO header on the 502
docker compose stop aggregator
curl -sI https://api.<your-domain>/health | grep -i access-control
docker compose start aggregator
```

## [6] Smoke tests

### [6.1] Aggregator health

```bash
curl -s https://api.<your-domain>/health | jq
# → {"ok":true, ...}
```

### [6.2] Chain reachable through the proxy

```bash
curl -s https://lcd.<your-domain>/cosmos/base/tendermint/v1beta1/blocks/latest \
  | jq .block.header.height
```

### [6.3] Oracle has gas

```bash
docker compose exec aggregator bun run meridian:bootstrap
# Either "[bootstrap-oracle] oracle already has N ubadge — no top-up needed"
# (if genesis seeded the oracle) or a successful drip from bot → oracle.
```

### [6.4] Morning script — creates today's strikes

```bash
docker compose exec aggregator bun run meridian:morning
# Creates ~5-7 strikes per ticker × 7 tickers = ~45 markets, idempotent
# (re-runs skip via UNIQUE(ticker, strike, close_date)). On a weekend or
# US holiday it exits early via `isTradingDay`; pass MERIDIAN_FORCE=true
# to bypass for a smoke test.
```

### [6.5] FE loads + lists the markets

Open `https://meridian.<your-domain>` — should show the new markets in the
list. If the page renders but markets are missing, the aggregator's
bootstrap scanner is still walking collection IDs; tail
`docker compose logs -f aggregator | grep bootstrap`.

## [7] Cron install — daily lifecycle

```bash
sudo mkdir -p /var/log/meridian && sudo chown $USER /var/log/meridian
crontab /opt/bitbadges-pm/deploy/crontab.example
crontab -l   # confirm the 3 entries are loaded
```

Schedule (US/Eastern, per [3.1]):

| Time | Script | What |
|---|---|---|
| 08:00 Mon-Fri | `meridian:morning` | Read prev close, generate strikes, create markets |
| 16:05 Mon-Fri | `meridian:evening` | Read close, cast settle vote on every unsettled market |
| 03:00 Mon | `meridian:bootstrap` | Top up oracle gas if drained (no-op when healthy) |

Both daily scripts are idempotent — safe to re-run by hand if a cron
firing failed (`docker compose exec aggregator bun run meridian:morning`).

## [8] Optional: chain-log tail for the Explorer tab

Off by default. See `deploy/README.md` §"Enable the Explorer node-logs
tail" for the systemd unit + logrotate + `docker compose up -d aggregator`
recreation. **Note the warning there:** logs become publicly viewable at
`/explorer` — fine on a devnet with no real funds, NOT fine on a chain
holding value.

## [9] Known gotchas (carry these forward)

Concentrated from past incidents (`git log --oneline` for the recent ones):

- **[9.1] Aggregator event-loop starvation under bot load.** The
  market-maker's intent posting was running synchronously inside the same
  loop tick as HTTP handlers → handlers timed out → Caddy 502 → browser
  blamed CORS. Fixed via event-loop yield + edge CORS (commit `1146b25`).
  If you see sporadic 502s during heavy bot activity, check
  `apps/aggregator/src/bot/seeder.ts` for any re-introduced sync loops.

- **[9.2] Heartbeat sweep starvation.** Same shape — long-running
  bookkeeping pass without `await`s starved HTTP. Fixed in `3c10e90`.
  Yield every N iterations.

- **[9.3] Vote backfill durability.** Casting a settle vote during a
  network blip could lose the vote silently. Fixed in `42db75b` —
  votes are durable + replayed on reconnect. If `meridian:evening`
  reports settled but the market still shows `unresolved`, force a
  refresh: `curl -X POST https://api.<your-domain>/api/v0/predictions/<id>/refresh-fills`.

- **[9.4] Morning script chain-broadcast retries.** Brief chain
  unavailability during `meridian:morning` used to fail the script
  midway. Now does backoff-retry (`a2585ae`). Tune via
  `MERIDIAN_MORNING_RETRY_ATTEMPTS` / `MERIDIAN_MORNING_RETRY_BASE_MS`.

- **[9.5] `/cosmos/tx/v1beta1/txs?events=...` is disabled on the chain's
  LCD.** Don't try to use it; use Tendermint RPC `/tx_search` instead
  (`apps/aggregator/src/chain/events.ts`).

- **[9.6] `/get_votes` LCD endpoint breaks on empty `approverAddress`** —
  grpc-gateway collapses `/foo//bar`. Vote tallies are mirrored from
  `cast_vote` tx events.

- **[9.7] Crontab path matters.** `cd /opt/bitbadges-pm/deploy` is
  required before `docker compose exec` — running from the repo root
  fails with "no configuration file provided".

- **[9.8] Strike dedup.** Markets are uniqued by
  `(ticker, strike, close_date)`. Re-running `meridian:morning` for the
  same day adds zero rows. Useful when a single ticker failed mid-batch:
  re-run and only the missing strikes get created.

- **[9.9] Cross-vendor price divergence.** `aggregateQuotes()` throws on
  >1% disagreement across Yahoo + Stooq (`MERIDIAN_PRICE_DIVERGENCE_PCT`).
  `meridian:evening` will then defer the settle and the
  `MERIDIAN_SETTLE_RETRY_WINDOW_MS` window opens. Manual override:
  `MERIDIAN_FORCE_SETTLE=true docker compose exec ...`.

## [10] Re-deprecating (when you tear it down again)

1. Re-run the preservation one-liner from [1.3] — fixtures may have
   changed if the oracle was rotated.
2. `crontab -r` to silence cron before pulling the plug, so the next
   morning's fire doesn't error on a missing aggregator.
3. `docker compose -f /opt/bitbadges-pm/deploy/docker-compose.yml down`
   (volumes survive `down`; use `down -v` only if you also want to nuke
   the SQLite).
4. `sudo systemctl stop bitbadgeschain && sudo systemctl disable bitbadgeschain`.
5. Destroy the droplet.
6. Update this runbook's `last-verified:` date and note any drift you
   spotted during the redeploy.
