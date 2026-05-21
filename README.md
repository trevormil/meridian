# Meridian — Binary Stock Outcome Markets

> A non-custodial, on-chain prediction-market app implementing the **Gauntlet AI Meridian** spec.
> Daily 0DTE markets on MAG7 stock closing prices · on-chain order book · oracle-driven settle
> · $1 USDC binary payout. Built on **[BitBadges](https://bitbadges.io)** —
> the Cosmos chain I built and maintain.

**Live deployment** · all four services running on a single DO droplet at NYC1:

| | URL |
|---|---|
| Frontend | <https://meridian.trevormil.com> |
| Aggregator API + WebSocket | <https://api.meridian.trevormil.com> |
| Chain LCD (Cosmos REST) | <https://lcd.meridian.trevormil.com> |
| Chain RPC (Tendermint) | <https://rpc.meridian.trevormil.com> |

See **[DEMO.md](./DEMO.md)** for a 5-minute reviewer walkthrough against the live deploy.

| | |
|---|---|
| **Spec compliance** | ✓ 49 daily strikes (7 MAG7 × 5-7 strikes) auto-created at 8 AM ET · ✓ 0DTE expiry · ✓ on-chain CLOB · ✓ $1 USDC redeem invariant · ✓ verifier-vote settle at 4:05 PM ET |
| **Tests** | 26/26 green — 8 unit, 2 chain-integration e2e (morning + evening lifecycle), 16 Playwright (UI through real chain txs) |
| **Deploy** | Single $24/mo DO droplet · Docker Compose · Caddy auto-TLS · cron-driven lifecycle |
| **Source** | ~12 KLOC TS · Bun + Hono aggregator · Next.js 14 App Router FE · Cosmos SDK chain (BitBadges) |

## Why BitBadges

The Meridian spec is open about chain choice — Solana / Anchor is the default
recommendation, EVM L2s and HyperLiquid are accepted alternatives. **I chose
[BitBadges](https://bitbadges.io)** for a deliberate reason: it's the chain
I built and maintain. Its `x/tokenization` module ships a native
`prediction-market` standard ([spec](https://docs.bitbadges.io/x-tokenization/examples/skills/prediction-market))
that gives Meridian, for free:

- **YES/NO complementary tokens** with the $1 invariant baked into protocol code
- **Intent-based CLOB** via the chain's approval system — no off-chain match engine,
  no custom contract; the chain enforces it
- **Verifier-vote settle** — a designated address casts `MsgCastVote` to flip
  market status; protocol-enforced single-signer permission
- **Atomic deposit / redeem** — `MsgTransferTokens` from the mint address gives
  you 1 YES + 1 NO per $1 deposited; the redeem path returns $1 per winning token

Building Meridian on Solana would have meant writing all of the above from
scratch in Anchor (~2-3 weeks of work this repo skips entirely). Building on
BitBadges meant I could focus the implementation effort on the **product** —
the daily lifecycle scripts, the aggregator + bots, the FE — instead of
re-implementing primitives.

Full trade-off discussion (oracle, order book, bot design) in
[ARCHITECTURE.md](./ARCHITECTURE.md). Chain repo:
<https://github.com/bitbadges/bitbadgeschain>.

The rest of the stack is purpose-built for this product:

- **Aggregator** (`apps/aggregator/`, Bun + Hono + bun:sqlite, ~3k LOC) indexes
  the chain's prediction-market state (collection enumeration, OHLC candles, intent
  order-book scans), pushes realtime updates over WebSocket, and hosts two always-on
  bots (a seeder that gives every new market 108 limit orders + an arbitrage bot
  that cross-matches profitable patterns every block).
- **Daily lifecycle** scripts (`apps/aggregator/src/meridian/`) are cron-friendly,
  idempotent, and use a sidecar SQLite table (`UNIQUE (ticker, strike, close_date)`)
  to make double-runs a database invariant. They wrap the same SDK builders the
  UI uses — no chain-side specialization.
- **FE** (`apps/web/`, Next.js 14 App Router) is a single-vertical prediction-markets
  product. Direct Keplr + MetaMask (no Privy custodial layer). Animated landing,
  static backdrops on data pages so they never compete with prices.

## Repo layout

```
bitbadges-pm/
├── apps/
│   ├── web/                  Next.js 14 App Router FE
│   │   ├── app/              Routes: / · /markets · /markets/[id] · /portfolio · /create
│   │   ├── components/
│   │   │   ├── landings/     10 landing variants (see /preview to compare)
│   │   │   └── prediction/   MarketCard, MarketHeader, IntentsPanel, …
│   │   └── lib/              chain queries, aggregator client, tx-bus
│   └── aggregator/           Hono + bun:sqlite indexer
│       ├── src/
│       │   ├── workers/      tx-watcher, price-poller, bootstrap, stats-poller
│       │   ├── bot/          seeder, arbitrage
│       │   ├── meridian/     morning.ts, evening.ts, bootstrap-oracle.ts (cron)
│       │   ├── chain/        LCD + tendermint-rpc wrappers
│       │   └── routes/       /api/v0/{predictions, intents, faucet, tx, uploads}
│       └── test/             unit + e2e against real local chain
├── deploy/                   Compose + Caddy + crontab + Dockerfiles + runbook
├── ARCHITECTURE.md           Chain choice, oracle, aggregator, bots — trade-offs
├── RISKS.md                  Honest limitations (oracle source, holidays, no HA)
└── DEMO.md                   5-min reviewer walkthrough
```

## Run locally

Prereqs: `bun` ≥ 1.3, a local BitBadges chain (`cr` =
`ignite chain serve --skip-proto --reset-once` against `~/CompSci/bitbadges/bitbadgeschain`).

```bash
# Link the local SDK so the apps build against your dev chain's protos
cd ../bitbadgesjs/packages/bitbadgesjs-sdk && bun link && cd -
bun install
(cd apps/web && bun link bitbadges)
(cd apps/aggregator && bun link bitbadges)

# Both apps (web on :3000, aggregator on :4001)
bun run dev

# Seed today's MAG7 markets immediately (skips if already present)
cd apps/aggregator && bun run meridian:morning
```

Wallet: connect Keplr to the local chain, OR add `?test=alice` to the URL for the
mnemonic-based test signer (used by Playwright).

Open <http://localhost:3000>.

## Test suites

All three suites run against a real local chain (no mocks).

```bash
# Unit + price (strike-generator, Yahoo parsing) — 8 tests · 500ms
cd apps/aggregator && bun test test/meridian/{strikes,prices}.spec.ts

# Meridian lifecycle e2e (morning script idempotent; evening settles all markets) — 2 tests · ~10 min
cd apps/aggregator && bun test test/meridian/e2e.spec.ts --timeout 600000

# Playwright UI (real chain txs through the browser) — 16 specs · ~30s
cd apps/web && bun run test:pw
```

## Deploy

The full prod runbook is in [deploy/README.md](./deploy/README.md). Short version:

```bash
# On a fresh Ubuntu 24.04 droplet:
timedatectl set-timezone America/New_York
curl -fsSL https://get.docker.com | sh
# … then build bitbadgeschaind, init via `ignite chain init`, systemd-enable it
cd /opt/bitbadges-pm/deploy
cp .env.example .env && $EDITOR .env   # set DOMAIN_* + ACME_EMAIL
docker compose --env-file .env up -d --build
crontab crontab.example                  # 8 AM / 4:05 PM ET cron
```

Caddy auto-provisions Let's Encrypt TLS for `{web,api,lcd,rpc}.your-domain.com`.

**Live**: <https://meridian.trevormil.com> — single $24/mo droplet running
chain (systemd) + aggregator + web + caddy (Compose) at NYC1. The 4 PM ET
cron settles the day's markets autonomously; the 8 AM ET cron creates the
next day's strikes. Caddy + Let's Encrypt handle TLS for all four subdomains
(`meridian` · `api` · `lcd` · `rpc`).

## More

- **[DEMO.md](./DEMO.md)** — guided walkthrough for a reviewer (5 min, no setup)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — why BitBadges, intent-based CLOB,
  off-chain oracle + on-chain vote, bot pair, daily lifecycle design
- **[RISKS.md](./RISKS.md)** — single-source oracle, single signer, no HA,
  holiday calendar gap, position-model permissiveness
- **[deploy/README.md](./deploy/README.md)** — one-droplet bootstrap + ops
- **[CLAUDE.md](./CLAUDE.md)** — debugging gotchas + chain PRs in flight
