# Aggregator E2E Suite

Autonomous end-to-end coverage for the prediction-market aggregator. Walks
every standard flow (create / deposit / trade / cancel / settle / redeem)
against a real local BitBadges chain with two persona accounts, verifying
both chain state AND the aggregator's SQLite mirror after each step.

## Prerequisites

1. Local chain running with the e2e personas seeded:
   ```bash
   cr      # = ignite chain serve --skip-proto --reset-once
   ```
   Once https://github.com/BitBadges/bitbadgeschain/pull/98 is merged the
   personas are auto-seeded. Until then the runner will detect the missing
   balances and auto-fund them from the `alice` keyring-test account.

2. `bitbadgeschaind` in `$HOME/go/bin/bitbadgeschaind` with `e2e-alice` and
   `e2e-bob` in keyring-backend `test` (already done if you used the same
   keyring this repo was set up with).

3. SDK linked (`bun link bitbadges`) inside `apps/aggregator/`.

## Run

From repo root:
```bash
bun run --filter '@bitbadges-pm/aggregator' test:e2e
```

Or from `apps/aggregator/`:
```bash
bun run test:e2e
```

## What it does

| Phase | Action |
|---|---|
| Bootstrap | Asserts chain LCD reachable, loads personas from `fixtures/personas.json`, funds them if needed, spawns a fresh aggregator on port 4042 with its own DB at `apps/aggregator/data-e2e/`. |
| Scenario 1 | Both personas deposit, alice posts a SELL-YES intent at 0.60, bob fills it. Verifies the chain balance shifts AND that the aggregator emitted a price candle ≈ 0.60 and marked the intent `used=1`. |
| Scenario 2 | Alice posts a BUY-NO intent then cancels. Asserts intent marked used + **no** price candle was emitted (cancels must not pollute history). |
| Scenario 3 | Alice deposits then pair-redeems (pre-settlement). Asserts YES/NO drop equally + USDC recovered ≈ 1:1. |
| Scenario 4 | Alice (verifier) votes YES wins. Asserts aggregator status flips to `resolved-yes`, bob's YES burns for USDC, NO burns for 0. |
| Scenario 5 | Same as 4 but NO wins. |
| Scenario 6 | Push outcome — verifier votes both push proposals; bob's YES + NO both burn for 0.5 USDC each. |

Each scenario creates its **own market**, so they're independent and a
failure mid-suite doesn't corrupt subsequent scenarios.

## Cleanup

The runner kills the aggregator on exit (success, failure, or Ctrl-C). The
data dir at `apps/aggregator/data-e2e/` is wiped on each run, so re-running
always starts fresh.

## Personas

| Persona | Address | Role |
|---|---|---|
| e2e-alice | `bb1sdt4dnqasla5v8yh56e4ny2dsrx77q0k8xfl3u` | market creator + verifier |
| e2e-bob | `bb1hfsdl5ew0z2al3u6gjk7exdrccg2qrcz2s7dhx` | trader / counterparty |

Mnemonics in `fixtures/personas.json` (gitignored). Regenerate via:
```bash
bitbadgeschaind keys add e2e-alice --keyring-backend test --output json
bitbadgeschaind keys add e2e-bob   --keyring-backend test --output json
```
Then paste the mnemonics into the fixture file. Addresses will change — update
`bitbadgeschain/config.yml` accordingly.

## Tuning

Env knobs (all optional):
- `E2E_CHAIN_ID` (default `bitbadges_1-1`)
- `E2E_LCD_URL` (default `http://localhost:1317`)
- `E2E_RPC_URL` (default `http://localhost:26657`)
- `E2E_AGGREGATOR_PORT` (default `4042` — separate from dev's 4001)
- `E2E_BLOCK_MS` (default `6000` — pad between txs so chain commits)
- `E2E_FUNDER` (default `alice` — seed account to fund personas from if needed)
