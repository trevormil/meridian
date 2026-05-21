# Meridian — risks & limitations

Per the Meridian spec, this is a short, non-regulatory note on the
limitations + failure modes a reasonable user / operator should be aware of.
No regulatory or compliance claims are made; nothing here is investment or
legal advice.

## Oracle risk

- **Single price source.** The settlement price for every market is pulled
  from a single Yahoo Finance unauthenticated endpoint. If Yahoo returns a
  stale / wrong / null value at 4:05 PM ET, every market for that day
  settles against that value. There is no consensus or median-of-N feeds.
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

- **No grace window.** The script settles whenever it runs (cron at
  4:05 PM ET in the suggested config). If the script is invoked before
  Yahoo has published the final close, the value used will be a
  near-close-but-not-final tick. The `isClosed` flag is logged but does
  NOT block settlement — operators should review.
- **Holidays / half-days.** The cron is `Mon-Fri` only and does not
  consult an exchange holiday calendar. On a US market holiday, morning
  would still create markets that simply never get a real close; evening
  would settle them against the prior close. Recommended: gate the cron
  on a holiday calendar (e.g., NYSE schedule API) before V1 ships.
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

- **No mainnet.** Meridian runs on a local / dev BitBadges chain with
  protocol fees disabled. Real funds are not in play.
- **Single aggregator.** The aggregator is a single Node process backed
  by SQLite. It is not horizontally scaled; loss of the DB = re-bootstrap
  from the chain (slow but lossless).
- **Cosmos finality.** Block time is ~1.5s on this devnet. Transaction
  ordering is single-block-atomic; cross-block sequencing for the
  seeder / arb bot relies on a 60s recent-failure cooldown to avoid
  thrashing on transient errors.

## Privacy & disclosure

- **Public oracle key.** The verifier address signs every settle vote
  in plaintext on-chain. Anyone scanning the chain can identify which
  account is the oracle. This is intentional (verifier transparency)
  but means the oracle account should NOT be reused for anything else.

## Out of scope

- Regulatory analysis (binary options, prediction-market, gambling, or
  securities law in any jurisdiction).
- KYC / AML.
- Tax treatment of YES / NO token redemptions.
- Margin or leverage (the binary structure makes both impossible: max
  loss per contract = $1).
