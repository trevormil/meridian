# Meridian — architecture & trade-offs

> Per the spec's documentation requirement: "Clear rationale for all
> architecture and chain decisions; trade-offs explained." This doc
> covers the non-obvious choices and why we picked them.

## Chain: BitBadges, not Solana / EVM L2 / HyperLiquid

The spec recommends Solana (Anchor) as the default, accepts EVM L2s,
and flags HyperLiquid as "worth considering." We chose **BitBadges**.
Trade-offs:

**Why BitBadges**
- **The primitive already exists.** BitBadges ships a native
  `prediction-market` standard inside its `tokenization` module —
  YES/NO complementary tokens, $1.00 redemption invariant, verifier
  voting, atomic intent-based order book. Building Meridian on Solana
  would have meant writing the same primitive from scratch in Anchor
  (≈2-3 weeks of work that this repo skips entirely).
- **Sub-second finality where it matters.** ~1.5 s block time. Spec
  asks for "sub-second" — we're slightly slower than that ceiling, but
  fast enough that order-book latency isn't the bottleneck (the matching
  engine, both human-driven and our arb bot, runs every block).
- **Intent-based CLOB is the standard.** Each limit order is an on-chain
  `MsgSetIncoming/OutgoingApproval`. No off-chain match engine, no
  custom contract. The chain enforces the $1 invariant + the
  outcome-based redeem in protocol code, not application code.
- **Single-signer settlement.** A designated verifier address casts a
  `MsgCastVote` to settle. The chain protocol enforces that only that
  address can vote on that market's outcome. No custom permission code.

**What we trade**
- Smaller ecosystem than Solana — no Phoenix CLOB to compose with, no
  Pyth oracle, no Jito. Operators wanting those would need to bridge.
- 1.5 s blocks vs ~400 ms on Solana. For 0DTE markets settling once at
  4:05 PM, this is not a real constraint.
- Smart-contract devs have to learn Cosmos SDK + the BitBadges
  approval/intent model. The CLI + SDK examples cushion this.

**Why not the alternatives**
- **Solana / Anchor**: re-implements every primitive (YES/NO mint,
  redeem invariant, vote settle, CLOB) in-program. Phoenix integration
  is mature but is a separate program to integrate with. Mature
  oracle (Pyth) is a plus.
- **EVM L2**: same custom-primitive problem; on-chain CLOB latency is
  the explicit risk the spec calls out.
- **HyperLiquid**: spec acknowledges binary-outcome instruments aren't
  natively supported.

## Order book: intent-based, not match-engine

BitBadges' approval system gives us a CLOB-equivalent without writing
a match engine:

- Each limit order is an on-chain approval (`MsgSetIncomingApproval`
  for a bid, `MsgSetOutgoingApproval` for an ask).
- A trade is a `MsgTransferTokens` that names two approvals (one for
  each side) in its `prioritizedApprovals` field. The chain runs the
  coin-transfers from each approval's `coinTransfers` block, then
  moves the tokens.
- Matching happens *off-chain* — anyone (a counterparty, the seeder,
  the arb bot) can submit the `MsgTransferTokens` that crosses two
  approvals.

**No partial fills.** Each approval is exact-quantity. We seed a
multi-quantity ladder (`[1, 5, 10]` tokens × 9 prices × 4 directions
= 108 intents per market) so common user order sizes have an exact
counter-order available.

**The arbitrage bot is the de-facto match engine.** Every ~1 block it
scans every market's intents for three patterns:
1. `bid_YES + bid_NO > $1` → deposit $1 + fill both buys
2. `ask_YES + ask_NO < $1` → fill both sells + redeem pair for $1
3. `bid.price ≥ ask.price` (same side) → cross-match, pocket the spread

This is what makes the book "feel" like a CLOB end-to-end.

## Oracle: off-chain Yahoo + on-chain vote, not Pyth

The spec describes an on-chain oracle the settle transaction reads.
We use **off-chain Yahoo Finance fetched by the verifier, then posted
as an on-chain `MsgCastVote`.** Why:

- **The chain's settle path is vote-based, not data-feed-based.**
  Whoever holds the verifier key signs a yes/no vote. The vote is
  what's read by the redeem path — the chain doesn't know stock prices
  natively.
- **Yahoo Finance is good enough for V1.** Free, no key, ~5 s p99
  latency, public methodology. The official close print is on a 15-30 s
  publication lag, well within our 4:05 PM (vs 4:00 PM close) buffer.
- **Audit trail.** The verifier's signed vote tx is on-chain forever
  and references the close it observed in the script log. Anyone can
  reproduce the Yahoo lookup for a given date and cross-check.

**Trade-offs flagged in `RISKS.md`:**
- Single source (no median-of-N feeds)
- Single signer (verifier-key compromise = arbitrary settlements)
- "At or above" rounding sensitivity to a $0.01 close vs strike

Production swap path: replace `prices.ts` with a Polygon / Alpha
Vantage / IEX backend (paid keys, signed feeds). The script's
oracle-signer logic stays unchanged.

## Aggregator: thin sidecar, not a full indexer

We need three things the chain doesn't index natively:
- Enumerate all prediction-market collections (chain has no "list
  collections by standard" query)
- Recent price candles per market (chain stores raw fills, not OHLC)
- Intent order book scans per market (chain returns per-user approvals;
  we want the whole-market view)

**Stack**: Bun + Hono HTTP + `bun:sqlite`. ~3000 LOC total, single
process. SQLite with `PRAGMA journal_mode=WAL` + `busy_timeout=10000`
handles concurrent writes from the cron scripts.

**Why not a subgraph / Cosmos indexer?** The data shape we need is
narrow and product-specific (prediction markets, candles, intents).
A general indexer would require dozens of mappings for one product.
The custom sidecar is ~1 week of work and trivially deployable.

**Real-time path**: Bun.serve hosts HTTP and a single `/ws` channel.
Five channels (`markets`, `market:{id}`, `intents:{id}`,
`intents-owner:{addr}`, `candle:{id}`) push snapshots on subscribe +
deltas on each chain event. The FE consumes via a singleton
`useRealtime` hook — no polling.

## Bots: seeder + arbitrage, always-on

Two workers run inside the aggregator process:

- **Seeder** (`SEED_MODE=true` only — defaults on for dev). Watches for
  new markets via the pubsub bus; on each new market deposits $144,
  mints 144 YES + 144 NO, posts 108 limit orders (price ladder ×
  quantity ladder × side × direction). Provides bootstrap liquidity so
  users have a counter-party on day one.
- **Arbitrage bot** (always on). Every block, scans active markets for
  the three arb patterns above. Profitable trades execute via the bot's
  signing key; non-profitable ones are skipped. Failed txs get a 60s
  cooldown by (collectionId, yes_approval_id, no_approval_id) so we
  don't burn gas retrying.

Together they make a fresh market feel like a live exchange the moment
it's created.

## Frontend: Next.js 14 App Router + client-side wallets

- **Next 14** for the framework — App Router, RSC where possible
  (Server Components for the layout shell), Client Components for
  anything with wallet / realtime / form state.
- **No Privy** — direct Keplr + MetaMask (via EIP-6963 / `mipd`) +
  optional test-mode mnemonic signer. Privy is a great retail
  onboarding tool but adds an external dependency and a custodial-ish
  layer that this product doesn't need.
- **bb1 vs 0x address handling.** Chain accounting is always under the
  bb1 form. MetaMask users sign Ethermint txs that get wrapped in
  `MsgEthereumTx`. Their 0x address is what shows in the connect
  pill — it's the user-facing identity. Under the hood every chain
  query uses the bb1 derivation.

## Daily lifecycle scripts: cron-friendly, idempotent

`apps/aggregator/src/meridian/morning.ts` + `evening.ts` are plain
TypeScript files that:
- Read fixtures + env once
- Walk every (ticker, strike) for today
- Skip rows already present in the `meridian_markets` sidecar table
- Exit non-zero on any failure (so cron retries can be wired in)

**Why a sidecar table** (`meridian_markets`, separate from `markets`)?
- The `markets` table is populated by the bootstrap scanner from the
  chain. The Meridian-specific (ticker, strike, close_date) tuple is
  product metadata not stored on-chain in a structured way (it's only
  in the market's name/description string).
- A separate table with `UNIQUE (ticker, strike, close_date)` makes
  idempotency a database invariant, not an application invariant.

## Dependency justifications

| Dep | Why |
|---|---|
| `bitbadgesjs-sdk` | Chain SDK — required for signing, msg builders, builders for prediction-market preset |
| `bun` (+ `bun:sqlite`) | Single-binary runtime + native SQLite; replaces `node + better-sqlite3 + tsx + Jest` |
| `hono` | Tiny HTTP router; ~12 KB, zero deps, plays well with Bun.serve |
| `next` | Required by spec (React + Next.js recommended) |
| `tailwindcss` | UI styling without writing CSS |
| `mipd` | EIP-6963 multi-injected-provider discovery — needed to pin MetaMask specifically and avoid Coinbase/Phantom hijacking `window.ethereum` |
| `react-blockies` | Wallet address identicons — visual hash of the bb1/0x address |
| `crypto-browserify`, `buffer` | Browser shims for the SDK's Node-only crypto path |

Everything else is dev-only or a sub-dep.

## What's intentionally out of scope (per spec or user)

- **Position constraint UI** (can't hold YES+NO concurrently) — spec
  recommends, we allow it. Pre-settlement pair redeem covers exits.
- **Atomic "Buy No = mint pair + sell Yes"** — implemented as two
  separate steps via the FE; UX-as-is per product decision.
- **Mainnet / real funds** — explicitly forbidden by spec.
- **Multi-chain** — single BitBadges chain only.
- **Mobile-native app** — responsive web only.
