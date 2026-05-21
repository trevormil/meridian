# BitBadges Prediction Markets

A standalone prediction-markets product on the BitBadges chain. Zero runtime
dependency on `bitbadges-indexer` or `bitbadges-frontend` — uses the BitBadges
SDK for chain interaction, ships a thin aggregator for the bits the chain
doesn't index, and renders its own UI.

## What's here

```
bitbadges-pm/
├── apps/web/           Next.js 14 App Router frontend
│                       Pages: / · /create · /markets/[id] · /portfolio
│                       Market detail has 5 tabs: Market · Order Book ·
│                       Deposit · Redeem · Settlement (verifier-only)
└── apps/aggregator/    Hono + bun:sqlite indexer
                        Tendermint tx-watcher (live + RPC backfill) +
                        block-based price/intent poller +
                        per-market stats poller (escrow → totalDeposited)
```

- **Backing coin**: USDC (single denom, hardcoded — keeps the standard simple)
- **Wallets**: Keplr direct (production); a mnemonic-based test signer when
  `NEXT_PUBLIC_TEST_MODE=true` (used by the Playwright suite)
- **Settlement**: a designated verifier address casts an on-chain
  `MsgCastVote` to flip a market to `resolved-yes` / `resolved-no` / `resolved-push`

## Run

Prereqs: `bun` ≥ 1.3, a local BitBadges chain running (`cr` alias =
`ignite chain serve --skip-proto --reset-once` against `~/CompSci/bitbadges/bitbadgeschain`).

```bash
# One-time SDK link
cd ../bitbadgesjs/packages/bitbadgesjs-sdk && bun link
cd -

# Install + link
bun install
cd apps/web && bun link bitbadges && cd -
cd apps/aggregator && bun link bitbadges && cd -

# Both apps
bun run dev
```

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| Aggregator | http://localhost:4001 |

### Other scripts

```bash
bun run dev:fresh         # rm aggregator data + dev
bun run wipe              # rm apps/aggregator/data
bun run reset-cursor      # drop sync_state cursors (re-scan, keep history)
```

## Test suites

Two complementary suites, both run against a real local chain.

### Aggregator e2e — backend coverage

```bash
cd apps/aggregator && bun run test:e2e
```

7 scenarios, ~2 min: deposit + intent fill, intent cancel, pre-settlement
redeem, YES wins, NO wins, push, sequential trades verify price evolution.
Asserts both chain state AND aggregator DB state on every step. Uses two
seeded personas (`e2e-alice`, `e2e-bob`) for signing.

### Playwright — frontend coverage

```bash
cd apps/web && bun run test:pw
```

15 specs, ~20s after build: page renders, persona-picker connect flow,
create-market form, market-detail tab rendering, real chain txs (create
market + deposit) driven through the UI with the mnemonic test signer.

## Test mode

The FE swaps Keplr for a deterministic mnemonic signer when
`NEXT_PUBLIC_TEST_MODE=true` is set at build time. The mnemonics are baked
into the JS bundle via `NEXT_PUBLIC_TEST_PERSONAS`. Used by Playwright; not
intended for production deployments.

## Architecture notes

- **Aggregator price formula**: headline `yes_price` = implied YES probability
  of the most recent fill. For YES fills, `coin / token`; for NO fills,
  `1 - (coin / token)`; protocol-fee transfers excluded. Mirrors the indexer's
  `getDetailsFromDoc` logic but stored locally per market.
- **Block-based polling**: aggregator checks chain height every 3s and only
  fires price/intent updates when the chain has advanced N blocks (default 5).
  No fake candles when the chain is paused.
- **Tx detection**: live `Tendermint37Client.subscribeTx` for new fills + votes;
  Tendermint RPC `/tx_search` backfill on startup + every 30s to catch up after
  restarts. The chain's LCD tx-by-event indexer is disabled, so we use the
  Tendermint indexer directly.

## Deploy

- Web → Vercel (`apps/web`)
- Aggregator → any Node host with persistent disk for SQLite (Fly.io, Railway,
  a VPS, etc.)

Note: production deployment also requires the chain to have its inclusive
protocol fee handled — the standard's 1:1 redeem math assumes no fee.

## More context

`CLAUDE.md` has the deeper dive — design decisions, debugging gotchas, every
chain PR in flight, and a "picking back up tomorrow" runbook. Read that
before making non-trivial changes.
