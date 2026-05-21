# bitbadges-pm — Claude Code context

Standalone prediction-markets product on the BitBadges chain. **Zero runtime
dependency on `bitbadges-indexer` or `bitbadges-frontend`** — uses the SDK
(`bitbadges` package) for everything chain-side, ships its own thin
aggregator for the bits the chain doesn't index, and renders its own FE.

## Architecture

```
bitbadges-pm/
├── apps/
│   ├── web/                Next.js 14 App Router frontend (port 3000 dev / 3042 e2e)
│   │   ├── app/                pages: / · /create · /markets/[id] · /portfolio
│   │   ├── components/         prediction/, ui/, tx/, wallet/
│   │   ├── contexts/           WalletContext (Keplr OR mnemonic test-signer)
│   │   ├── lib/
│   │   │   ├── chain/          LCD wrappers, broadcast, keplr.ts, test-wallet.ts
│   │   │   ├── prediction-market/  builders, intents, balances, sdk re-exports
│   │   │   └── aggregator.ts   HTTP client to apps/aggregator
│   │   └── test/playwright/    Playwright suite (15 specs)
│   └── aggregator/         Hono + bun:sqlite indexer (port 4001 dev / 4042 e2e / 4043 pw)
│       ├── src/
│       │   ├── chain/          LCD client, events.ts (usedApprovalDetails + cast_vote parsers)
│       │   ├── db/             schema.ts (markets/price_history/intents/votes/sync_state)
│       │   │                   candles.ts, intents.ts, votes.ts
│       │   ├── routes/         predictions.ts, tx.ts, node.ts
│       │   ├── workers/        bootstrap, price-poller, intent-watcher,
│       │   │                   stats-poller, tx-watcher, status-updater
│       │   ├── bot/             seeder + arbitrage workers
│       │   ├── meridian/        daily lifecycle scripts (8 AM / 4:05 PM)
│       │   └── scripts/        reset-cursor.ts
│       └── test/e2e/           Chain-driving e2e suite (7 scenarios, 2 personas)
└── package.json            Bun workspace
```

**Data flow**: chain (`localhost:1317` LCD + `26657` RPC) → aggregator (caches
markets, votes, fills, candles in SQLite) → FE (talks to aggregator for
metadata/lists; SDK signs directly via aggregator's `/api/v0/{simulate,broadcast}`
proxy).

## Meridian daily lifecycle

Per the Meridian project spec — daily binary-outcome markets on MAG7 stocks
(AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA). Each day creates ~5-7 strike
markets per ticker (±3/6/9% from prev close, rounded to $10, dedup) and
settles them after market close.

```bash
cd apps/aggregator
bun run meridian:bootstrap   # one-time, drips BADGE+USDC from bot → oracle
bun run meridian:morning     # 8:00 AM ET cron — creates that day's strikes
bun run meridian:evening     # 4:05 PM ET cron — settles via oracle vote
```

**Oracle**: `bb1teqphl72qc32xy95m3jvnkdv78lvwn096yewjl` (account `oracle` in
`bitbadgeschain/config.yml`). Mnemonic in `apps/aggregator/fixtures/oracle.json`
(gitignored). Designated verifier on every Meridian market.

**Price source**: Yahoo Finance unauthenticated chart endpoint
`https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}` — free, no API
key, public historical+current closes. Production would swap to Polygon /
Alpha Vantage / IEX with a paid key.

**Cron** (US/Eastern):
```
0  8  * * 1-5  cd /path/to/bitbadges-pm/apps/aggregator && bun run meridian:morning >> /var/log/meridian-morning.log 2>&1
5 16  * * 1-5  cd /path/to/bitbadges-pm/apps/aggregator && bun run meridian:evening >> /var/log/meridian-evening.log 2>&1
```

Both scripts idempotent — re-runs skip already-created / already-settled rows
via the `meridian_markets.UNIQUE(ticker, strike, close_date)` constraint.

## Quick run

```bash
# Terminal 1 — chain (~5s reset)
cr                                # = ignite chain serve --skip-proto --reset-once

# Terminal 2 — both apps
cd ~/CompSci/bitbadges/bitbadges-pm
bun run dev                       # web :3000 + aggregator :4001
```

Other root scripts:
- `bun run wipe` — `rm -rf apps/aggregator/data` (fresh DB next start)
- `bun run dev:fresh` — wipe + dev
- `bun run reset-cursor` — drop `sync_state` cursors only (re-scan keeps history)

## Test commands

```bash
# Backend e2e — 7 scenarios against real chain with 2 personas
cd apps/aggregator && bun run test:e2e
# Expected: 7 passed in ~2 min

# Frontend Playwright — 15 specs (4 render + 3 connect + 3 form + 2 detail + 3 flow)
cd apps/web && bun run test:pw
# Expected: 15 passed in ~20s after build (~1m first run for build)
```

Both suites assume `cr` is already running. **Both share the same two
personas** from `apps/aggregator/test/e2e/fixtures/personas.json` (gitignored).

## Chain PRs in flight (bitbadges/bitbadgeschain)

All on the local dev chain via working-tree edits, then PR'd for review:

| # | Branch | What | Status |
|---|---|---|---|
| 97 | `config/seed-keplr4-bb1rf737` | Seed keplr4 (bb1rf737…) | open, superseded by #99 |
| 98 | `config/seed-e2e-personas` | Seed e2e-alice + e2e-bob | open, superseded by #99 |
| 99 | `chore/disable-protocol-fee-local` | **Latest** — bundles everything: disable inclusive protocol fee (`ProtocolFeeDenominator = 0`), seed e2e-alice + e2e-bob, seed keplr4 | open |

Working tree on `chore/disable-protocol-fee-local` has all the above. The user
runs `cr` against that branch directly; `--reset-once` re-bakes the genesis with
those accounts every time.

## Persona setup

Two test wallets (`bitbadgeschaind keys add e2e-{alice,bob} --keyring-backend test`):

| | e2e-alice | e2e-bob |
|---|---|---|
| Role | market creator + verifier | trader / counterparty |
| Address | `bb1sdt4dnqasla5v8yh56e4ny2dsrx77q0k8xfl3u` | `bb1hfsdl5ew0z2al3u6gjk7exdrccg2qrcz2s7dhx` |

Mnemonics live in `apps/aggregator/test/e2e/fixtures/personas.json` (git-ignored).
Both the aggregator e2e suite AND Playwright load from the same file. To
regenerate keys: `bitbadgeschaind keys add e2e-alice --keyring-backend test --output json`,
copy mnemonic into the fixture, update chain config.yml's e2e-alice address.

## TEST_MODE plumbing (FE)

The FE swaps Keplr for a mnemonic signer when `NEXT_PUBLIC_TEST_MODE=true`. The
mnemonics are baked into the JS bundle via `NEXT_PUBLIC_TEST_PERSONAS`. The
connect button shows a persona picker (data-testid `connect-test`) instead of
the Keplr trigger.

```bash
NEXT_PUBLIC_TEST_MODE=true \
NEXT_PUBLIC_TEST_PERSONAS='[{"name":"e2e-alice","address":"bb1...","mnemonic":"..."}]' \
NEXT_PUBLIC_AGGREGATOR_URL=http://localhost:4043 \
bun run build && bun run start
```

Playwright's `playwright.config.ts` does this automatically — no manual env.

## Canonical price formula

Documented in `apps/aggregator/src/chain/events.ts:impliedYesPrice` and tested
in scenario 7. Short version:

- Headline `yes_price` = implied YES probability of the **most recent fill**
- For a YES fill: `coin_amount / token_amount`
- For a NO fill: `1 - (coin_amount / token_amount)`
- Protocol-fee coin transfers excluded (`IsProtocolFee: false` only)
- Multi-token transfers (pair-mint, pair-redeem) return null — they're not trades
- The same value goes into 10m/1h/1d candles (OHLC tracked per bucket)

The chart auto-anchors at 50/50 at the start of the visible window so the line
visually begins at the neutral prior and jumps to real prices on first fill.

## Aggregator quirks worth knowing

- **Block-based polling**, not wall-clock — `price-poller` checks chain height
  every 3s and fires `pollPricesOnce()` + `refreshAllIntents()` only when
  `current - last_polled_height >= PRICE_POLL_EVERY_BLOCKS` (default 5).
  No fake candles when the chain is paused.
- **`/get_votes` LCD endpoint is broken with empty `approverAddress`** — grpc-gateway
  collapses `/foo//bar` paths. Vote tallies are mirrored from
  `message.msg_type=cast_vote` tx events instead (`chain/events.ts:parseCastVotes`).
- **`/cosmos/tx/v1beta1/txs?events=…` is disabled on the chain's LCD** — we use
  Tendermint RPC `/tx_search?query=usedApprovalDetails.collectionId='N'` for
  historical fill backfill.
- **Backfill walks ASC** — `updateMarketPrice` overwrites with each iteration,
  so newest must come last. The asc-order is critical; previous DESC order
  silently stuck headline prices on the oldest historical fill.
- **`POST /api/v0/predictions/:id/refresh-fills`** — synchronously re-scans
  Tendermint for fills + votes for one collection. e2e suites ping it after
  every `fillIntent` / `vote` so chain-state lag never breaks an assertion.

## FE quirks worth knowing

- **`bitbadges` SDK's compiled `dist/cjs/`** has literal `require('crypto')` calls
  webpack can't statically resolve. `lib/chain/test-wallet.ts` injects a
  runtime `require` shim that returns the bundled `crypto-browserify` — must
  load BEFORE the SDK is imported. Don't move that block.
- **`next.config.mjs`** aliases `crypto` → `crypto-browserify` for browser
  bundles, prefers SDK's ESM build via `mainFields: ['module', 'browser', 'main']`,
  and provides `Buffer` global via webpack `ProvidePlugin`.
- **Markets list** uses the aggregator only — chain has no "list collections"
  RPC, so the aggregator's bootstrap scanner enumerates IDs 1..N.
- **Transfer-times unit = MILLISECONDS** on chain. Intents posted with seconds
  end up "expired" at chain time (which is ms). `buildIntentMsg` multiplies by 1000.

## Known gotchas

- **`buildPredictionMarket` requires image** — silently throws `MetadataMissingError`
  if `image` is empty. The FE form treats image as optional. Worth surfacing in UI.
- **Protocol fee was 0.1%** until PR #99 — broke 1:1 redeem math (escrow held 99.9%,
  full-balance redeem asked for 100%). Disabled for local dev. Re-enabling in
  prod will require either grossing-up deposits or scaling redeem rates.
- **Heavy markets** — `MsgUniversalUpdateCollection` is large (7 frozen approvals + metadata).
  Took ~2.6s end-to-end in PW; e2e suite uses default 6s block-wait but real chain
  is faster (~1s blocks). Don't be alarmed by a "long" Deploy click.
- **`bitbadgeschain` is normally frozen** per memory `feedback_chain_code_frozen.md`.
  User explicitly authorized the protocol-fee disable + persona seed work for
  local dev; don't generalize that to other chain edits.

## What's done vs not

**Done**
- Two-pane app: production-quality Next.js FE + Hono/SQLite aggregator
- Full prediction-market UX: create / browse / market detail (5 tabs: Market /
  Order Book / Deposit / Redeem / Settlement) / portfolio
- Order book: post buy/sell intents, cancel, fill (swap)
- Redeem flows: pre-settlement pair-burn, YES wins, NO wins, push
- Settlement: verifier-only cast vote, status flips to resolved-*, candle + price evolve
- Aggregator: bootstrap scan, block-based price poller, intent watcher (no
  phantom candles), tx watcher (live + Tendermint RPC backfill), stats poller
  (escrow → totalDeposited), status updater (vote tally → resolved-* status)
- 7/7 backend e2e scenarios (cover every flow on real chain)
- 15/15 Playwright specs (4 render + 3 connect + 3 form + 2 detail + 3 real-tx flow)
- Test-mode wallet (mnemonic signer) for headless Playwright signing
- Chart anchored at 50/50 prior

**Deferred / not done**
- Real-time WS push to FE (poll only, 15s for intents, block-tick for prices)
- Pool/gamm swap UI (intent order book covers P2P trading; pool would be next)
- Full order-fill order routing (single-fill only — no partial fills)
- Image-required validation in create form (currently the form lets you submit
  without image, then it errors silently inside the SDK)
- MetaMask / WalletConnect (Keplr only; per memory `project_custom_chain_wallet_integration.md`)
- Production protocol-fee handling (currently disabled for local dev only)

## Useful one-liners

```bash
# Inspect aggregator DB without running aggregator
sqlite3 apps/aggregator/data/aggregator.sqlite "SELECT collection_id, name, status, yes_price, total_deposited FROM markets;"
sqlite3 apps/aggregator/data/aggregator.sqlite "SELECT COUNT(*) FROM price_history;"

# Force the aggregator to backfill a single market's fills/votes (synchronous)
curl -X POST http://localhost:4001/api/v0/predictions/<id>/refresh-fills

# Find chain txs by user
curl -s "http://localhost:26657/tx_search?query=%22transfer.sender%3D%27bb1sdt4dnqasla5v8yh56e4ny2dsrx77q0k8xfl3u%27%22&per_page=5&order_by=%22desc%22"

# Check escrow balance for market N (where escrow address is on the collection)
curl -s "http://localhost:1317/cosmos/bank/v1beta1/balances/<mintEscrowAddress>"
```

## When picking back up

1. Make sure chain is running (`cr`). If you bumped its branch, re-`cr` so the
   `--reset-once` re-seeds accounts.
2. `cd bitbadges-pm && bun run dev:fresh` — fresh aggregator DB + dev servers.
3. Run both test suites to confirm baseline:
   - `cd apps/aggregator && bun run test:e2e` → 7/7
   - `cd apps/web && bun run test:pw` → 15/15
4. If PR #99 hasn't landed yet, the protocol fee is still 0.1% — that breaks
   full-balance redeem. Either merge it or partial-redeem.
