# Meridian — risks & limitations

Per the Meridian spec, this is a short, non-regulatory note on the
limitations + failure modes a reasonable user / operator should be aware of.
No regulatory or compliance claims are made; nothing here is investment or
legal advice.

## Oracle risk

- **Median-of-N with guards (residual: correlated vendor failure).** The
  settlement price is the cross-vendor median of three keyless feeds (Yahoo
  ×2 hosts + Stooq), with a min-sources guard (won't settle on a lone
  reading) and a divergence guard (won't settle when sources disagree by
  >1%). A single stale / wrong / null feed no longer settles the day. The
  residual risk is *correlated* failure — all three feeds ultimately source
  from a small number of upstream data vendors, so a shared upstream outage
  or a market-wide bad print could still pass the divergence check.
- **Off-chain trust assumption.** The verifier (oracle) account is the
  single signer of every settle vote. A compromise of the oracle's
  mnemonic = ability to settle every market to an arbitrary outcome.
  Mitigation: rotate the key after the demo; for production use a multisig
  or threshold signer (TSS).
- **Source-of-truth drift.** Yahoo's published close may differ slightly
  from the official NYSE / NASDAQ closing print (e.g., post-market
  adjustments). Per the spec's "at or above" rule, a difference of even
  $0.01 around the strike flips the outcome.

## Settlement timing

- **isClosed defer gate.** If the script is invoked before the sources
  agree the session is closed, the not-closed ticker is **deferred** (left
  unsettled) rather than settled against a near-close-but-not-final tick.
  Deferred tickers fall through to the non-zero exit so the next cron run
  retries them. `MERIDIAN_FORCE_SETTLE=true` overrides for manual operation.
- **Calendar gate (residual: annual table update, fails open).** Both
  scripts consult an NYSE full-closure calendar (`calendar.ts`) and no-op on
  holidays / weekends, so morning no longer creates markets that never close
  and evening no longer settles against a stale prior close. The residual
  risk is operational: the holiday table is hardcoded per year and must be
  extended annually. It **fails open** — an uncovered year is treated as
  always-trading (with a logged warning) so a missed update degrades to
  "runs on a holiday" (visible) rather than silently halting the product.
  Half-days are normal trading days (the 4:05pm settle runs after the 1pm
  early close).
- **Time-zone correctness.** All scheduling uses `America/New_York` via
  `Intl.DateTimeFormat`. Servers running in any TZ will produce the
  correct calendar day, but operators must ensure cron itself runs at the
  intended ET wall-clock time.

## Order-book limitations

- **All-or-nothing fills.** The chain enforces exact-quantity matching;
  partial fills are not supported (the seeded ladder uses `[1, 5, 10]`
  token sizes to make common user orders fillable, but a 7-token user
  order can only cross a 7-token counter-order — not split across two).
- **No matching engine guarantee.** The on-chain order book is a set of
  static approvals; a trade only executes when *some other party* (a
  user, the seeder bot, or the always-on arbitrage bot) submits a
  `MsgTransferTokens` that uses both approvals. If no one matches a
  posted order, it sits indefinitely until cancelled or expired.

## Position model

- **Concurrent YES + NO is allowed.** The spec recommends preventing a
  user from holding both YES and NO on the same strike outside the
  transient mint-and-sell step. Meridian's UI does NOT enforce this; the
  user is free to hold both. Pre-settlement redemption (burn 1 YES + 1
  NO → 1 USDC) is offered for closing out such positions.

## Chain & infrastructure

- **No mainnet.** Meridian runs on a self-hosted BitBadges devnet with
  protocol fees disabled. Real funds are not in play. Production deploy
  is a single $24/mo DigitalOcean droplet — adequate for the demo, but
  a single point of failure.
- **Single aggregator.** The aggregator is a single Bun process backed
  by SQLite. It is not horizontally scaled; loss of the DB = re-bootstrap
  from the chain (slow but lossless).
- **Single chain validator.** The droplet runs a single-validator
  bitbadgeschaind. Liveness depends on that one node; double-signing is
  impossible (only one signer) but the chain halts if the node halts.
  Production would stand up a 3+ validator set with sentry topology.
- **Cosmos finality.** Block time is ~1.5s on this devnet. Transaction
  ordering is single-block-atomic; cross-block sequencing for the
  seeder / arb bot relies on a 60s recent-failure cooldown to avoid
  thrashing on transient errors.

## Privacy & disclosure

- **Public oracle key.** The verifier address signs every settle vote
  in plaintext on-chain. Anyone scanning the chain can identify which
  account is the oracle. This is intentional (verifier transparency)
  but means the oracle account should NOT be reused for anything else.
- **Public node logs (Explorer).** When the optional node-logs tail is
  enabled (see `deploy/README.md`), the chain's `journalctl` output is
  publicly viewable at `/explorer` — tail-only (≤500 lines), read-only.
  Intentional transparency on a devnet with no real funds; it must be
  scrubbed or authenticated before use on any chain holding real value.

## Out of scope

- Regulatory analysis (binary options, prediction-market, gambling, or
  securities law in any jurisdiction).
- KYC / AML.
- Tax treatment of YES / NO token redemptions.
- Margin or leverage (the binary structure makes both impossible: max
  loss per contract = $1).
