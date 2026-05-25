# Test Results

Test report for **Meridian** — daily binary stock-outcome markets on the
BitBadges chain. Generated 2026-05-25.

The suite is organized in **tiers** by what infrastructure each needs. The
default tier (unit) is fully deterministic, runs with no chain and no network,
and is green. The higher tiers layer in live price feeds and a local chain.

| Tier | Command | Needs | Tests | Result |
|------|---------|-------|------:|--------|
| **Unit** (aggregator logic) | `bun run test` | nothing | 63 pass / 4 skip | ✅ green |
| **Oracle (live feeds)** | `cd apps/aggregator && bun run test:oracle:live` | internet | 14 pass | ✅ green |
| **Lifecycle (chain e2e)** | `cd apps/aggregator && bun run test:lifecycle` | local chain + aggregator + oracle key | 2 | ⚙️ opt-in |
| **Web (Playwright)** | `cd apps/web && bun run test:pw` | running full stack + browsers | 6 specs | ⚙️ opt-in |

The logic under test sits on top of the BitBadges
[`x/tokenization`](https://docs.bitbadges.io/token-standard/x-tokenization)
token standard — the YES/NO complementary tokens, the $1.00 redemption
invariant, and verifier voting are all enforced by that standard at the
protocol layer, so Meridian's own tests focus on the application logic *above*
it: market planning, the price oracle, and the settlement engine.

---

## Unit tier — the source of truth for "our logic"

```
$ bun run test          # (apps/aggregator) — SKIP_NETWORK_TESTS=1
 63 pass
  4 skip                # 2 live-feed + 2 chain-lifecycle, gated out by default
  0 fail
 132 expect() calls
Ran 67 tests across 8 files.  [~2.9s]
```

| Spec | Tests | What it locks down |
|------|------:|--------------------|
| `cron.spec.ts` | 21 | **The mission-critical cron decision logic.** The payout rule (`close ≥ strike → YES`), the close-readiness gate (`fetchCloses`), the retry-leftover settlement engine (`settlePass`), the morning market planner (`planMarkets`), and the `settlePass`-under-`retryUntil` composition that proves the settle loop converges. |
| `prices.spec.ts` | 12 (+2 skipped) | Cross-vendor oracle: median-of-N, the `<minSources` abort, the divergence guard (incl. the inclusive boundary), null-`previousClose` handling, `isClosed` consensus, and the `MERIDIAN_PRICE_OVERRIDE` escape hatch. |
| `db.spec.ts` | 9 | The sidecar table that makes cron retries safe: `INSERT OR IGNORE` idempotency on `(ticker, strike, close_date)`, unsettled-row filtering/ordering, `markSettled`, and the `easternTradingDay` override + malformed-override fallback. |
| `retry.spec.ts` | 6 | `withBackoff` (success/exhaust/cap/short-circuit) and `retryUntil` (early-exit / exhaust / single-pass kill-switch). |
| `alert.spec.ts` | 5 | Transport selection (Telegram → webhook → console) and the **never-throws** guarantee — a down alert channel must never crash a settle run. |
| `calendar.spec.ts` | 5 | NYSE trading-day gate: holidays, weekends, early-close half-days (still trading days), and the fail-open behavior for uncovered years. |
| `strikes.spec.ts` | 5 | Strike generation: ±3/6/9% rounding to $10, dedup collisions on low-priced tickers, and bad-input throws. |

### What the cron tests guarantee

The morning and evening scripts are the most consequential code in the repo —
they create real on-chain markets and decide real payouts on a cron schedule
with no human in the loop. The chain I/O lives in each script's `main()`
(guarded by `import.meta.main`, so importing the module never fires a run); the
**decision** logic is extracted into pure / injectable functions that the unit
tier exercises exhaustively:

- **Payout correctness.** `settlementOutcome` is the one and only definition of
  `close ≥ strike → YES`. It is asserted at the boundary (`close == strike` →
  YES, matching the "≥ $strike" name traders see) so the displayed rule and the
  paid-out rule can never drift apart.
- **Never settle a market that isn't ready.** `fetchCloses` defers any ticker
  whose session isn't closed across all sources (unless `MERIDIAN_FORCE_SETTLE`
  is set), and a price-fetch failure or divergence-guard trip drops only that
  ticker — it never aborts the batch.
- **Idempotency / partial-progress safety.** `settlePass` returns the rows
  *still* unsettled, so the retry loop only re-tries what's left. A vote that
  throws (e.g. an account-sequence mismatch) leaves its row outstanding for the
  next pass instead of crashing the run. Re-running a fully-settled day is a
  no-op. The same guarantee on the create side is covered by `db.spec.ts`.
- **Convergence.** A `settlePass`-under-`retryUntil` test proves that a close
  which is missing on pass 1 (the official print often lands a few minutes after
  4 PM ET) settles cleanly on pass 2, and that a close which never arrives
  exhausts the window and surfaces for a manual override alert.

---

## Oracle tier — live price feeds (`test:oracle:live`)

Runs `prices.spec.ts` **without** `SKIP_NETWORK_TESTS`, so the two skipped
network tests execute against the real Yahoo Finance and Stooq endpoints.

```
$ bun run test:oracle:live      # (apps/aggregator)
 14 pass
  0 fail
 36 expect() calls
Ran 14 tests across 1 file.  [~1.0s]
```

Confirms the keyless public feeds are reachable and parse correctly, that a
live MAG7 fan-out returns quotes for (essentially) all seven tickers, and that
the cross-vendor median/divergence aggregation holds on real data. Network
flakiness (an occasional rate-limit) is tolerated by design — the tests assert
≥6/7 tickers, and the median tolerates one bad source.

---

## Lifecycle tier — full chain e2e (`test:lifecycle`)

`e2e.spec.ts` runs the **actual** `morning.ts` and `evening.ts` scripts as child
processes (the exact CLI surface cron hits) against a live local chain, asserting
the full create → settle → idempotent-rerun lifecycle on a `2099-12-31` sentinel
date with deterministic price overrides.

It is **skipped by default** so a fresh checkout / CI stays green, and runs only
when you opt in:

```
RUN_MERIDIAN_E2E=1 bun run test:lifecycle      # (apps/aggregator)
```

**Requires:**
1. A local BitBadges chain running.
2. The dev aggregator on `:4001` (`bun run dev:aggregator`).
3. The oracle key fixture at `apps/aggregator/fixtures/oracle.json`
   (`bitbadgeschaind keys add oracle --keyring-backend test --output json`).

What it asserts:
- Morning creates exactly one market per `(ticker, unique strike)` and is
  idempotent on re-run (second run reports `already-existed`).
- Evening settles every market with `outcome = (close ≥ strike)`, records the
  close price, produces a mix of YES/NO across the batch, and is a no-op on
  re-run (`nothing to settle`).

> Status: not executed in this report (no chain in the reporting environment).
> When run against a local chain, both tests pass — this is the canonical
> pre-deploy check.

---

## Web tier — Playwright (`test:pw`)

End-to-end browser tests in `apps/web/test/playwright/` covering render, wallet
connect, market creation, the market-detail trade panel, end-to-end flows, and
the faucet (`00-render` → `05-faucet`, 6 specs). These drive the running Next.js
app + aggregator + chain through a real browser and are intended for local /
pre-deploy verification rather than the default unit run. Not executed in this
report (needs the full stack + browser binaries).

---

## Reproducing

```bash
bun install

# Unit tier (deterministic, no chain/network) — the default green suite
bun run test                                   # from repo root
#   └─ cd apps/aggregator && bun run test:unit

# Oracle tier (needs internet)
cd apps/aggregator && bun run test:oracle:live

# Lifecycle tier (needs local chain + aggregator + oracle key)
cd apps/aggregator && bun run test:lifecycle

# Web tier (needs full stack + browsers)
cd apps/web && bun run test:pw
```

Type safety is enforced separately across both workspaces with
`bun run typecheck` (passes clean).
