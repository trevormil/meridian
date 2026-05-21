# Demo — 5-minute walkthrough

A guided tour of the live deploy. Each step is one tab + one click. Total
time ~5 minutes. Live URL: <https://meridian.trevormil.com>.

## What to look at

### 1. Landing — `/` (~30s)

A single-purpose marketing page: the **Meridian** brand glyph, a **live
trading-day timeline** (8 AM Create → 9:30 Open → 4:00 Close → 4:05 Settle,
with the current step glowing gold), and a sample of the day's active markets.

**Look for:** the animated electricity-grid backdrop (gold circuit nodes with
cascading pulses) — pure Canvas, ~60fps, GPU-only, honors `prefers-reduced-motion`.
The static app pages drop it for a quieter backdrop so trading data isn't
distracted.

### 2. Browse — `/markets` (~45s)

The full market grid: **5 status tabs** (Active / YES wins / NO wins / Push /
Other) and a per-ticker grouping that shows each MAG7 ticker's strike ladder
with current YES%. Cards lead with `> $strike` in Fraunces serif, a probability
bar, and a live YES percentage.

**Look for:** consistent visual rhythm — every card the same height, gold
reserved for "live" status + CTAs, YES = green / NO = red (prediction-market
convention).

### 3. Market detail — pick any active market (~60s)

5 tabs (Market / Order Book / Activity / Deposit / Redeem). Start on **Market** —
the **PriceChart** shows YES/NO dual lines, 10m/1h/1d timeframe selector, the
chart Y-axis pinned to 0-100%. Switch to **Order Book / Depth** to see the
intent-based CLOB (bids on the left, asks on the right, mid-price + spread
in the middle).

**Look for:** real fills. The arbitrage bot (always-on, runs every block)
cross-matches profitable patterns; the seeder posts 108 intents per new market
so the book is never empty. Both update over WebSocket — no page reloads.

### 4. Place an order (~60s)

If you have a wallet connected (Keplr) and some USDC, the **Place Order** panel
on the right lets you buy or sell either side at any price. Sell mode shows
`Your YES: N` + a Max chip; buy mode keeps the form simple since posted bids
don't move USDC until they fill.

If you don't have a wallet: the **/faucet** route on `/portfolio` drips USDC
(test) — funded from the faucet account on the seed config. Then deposit
USDC to mint a 1:1 YES + NO pair.

**Look for:** the swap-card preview in Deposit ("You pay 10 USDC → You receive
10 YES + 10 NO") and the conversion-row layout in Redeem (each side shown
separately, losing side dimmed with "Burn · no payout").

### 5. Portfolio — `/portfolio` (~30s)

Your YES/NO positions across every market, valued at the current quote, with
a Max-redeem chip on each row. Refreshes via the same WebSocket bus as the
market pages — every fill updates here too.

### 6. Activity tab on any market (~30s)

Back to a market detail page, click **Activity**. Every fill on that market
streams in with the from/to address, side, qty, price, timestamp. Your own
fills highlight in gold. **All / Mine** sub-tabs.

## What's running in the background

- **chain** (`bitbadgeschaind`, systemd unit) — single-node BitBadges
  devnet, ~1.5s block time
- **aggregator** (Bun + Hono + bun:sqlite, Compose) — Tendermint WS
  tx-watcher, block-based price poller, REST + WebSocket, two bots
- **web** (Next.js 14 prod build, Compose) — terminates at port 3000,
  proxied by Caddy with auto-TLS
- **caddy** (Compose) — Let's Encrypt for 4 subdomains
- **cron** on the host:
  - `0 8 * * 1-5` America/New_York → `meridian:morning` (creates ~45 strikes)
  - `5 16 * * 1-5` America/New_York → `meridian:evening` (settles via oracle vote)
  - `0 3 * * 1` → weekly oracle gas top-up

## What to ask after the walkthrough

If you want to dig into the design choices:

- **Chain choice**: why BitBadges over Solana/EVM — `ARCHITECTURE.md` § *Chain: BitBadges, not Solana / EVM L2 / HyperLiquid*
- **Order book**: how intent-based CLOB works without a match engine —
  `ARCHITECTURE.md` § *Order book: intent-based, not match-engine*
- **Oracle**: off-chain Yahoo + on-chain vote trade-offs —
  `ARCHITECTURE.md` § *Oracle: off-chain Yahoo + on-chain vote, not Pyth*
  and `RISKS.md` § *Oracle risk*
- **Daily lifecycle**: cron-friendly idempotent scripts —
  `ARCHITECTURE.md` § *Daily lifecycle scripts*
- **Honest limitations**: every known gap — `RISKS.md`

## What a reviewer can break / poke at

- **Force settlement now**:
  ```bash
  ssh root@198.199.70.29 \
    "cd /opt/bitbadges-pm/deploy && docker compose exec aggregator bun run meridian:evening"
  ```
  Watches every active market flip to `resolved-yes` / `resolved-no` based
  on the day's actual MAG7 closes. Then refresh `/markets` and switch to
  **YES wins** / **NO wins** tabs to see the outcomes.
- **Tail the chain**:
  ```bash
  ssh root@198.199.70.29 'journalctl -u bitbadgeschain -f | head -50'
  ```
  Block production at ~1.5s; tx events for every fill the seeder + arb bot
  generate.
- **Read the aggregator DB**:
  ```bash
  ssh root@198.199.70.29 \
    "docker compose -f /opt/bitbadges-pm/deploy/docker-compose.yml exec aggregator \
       sqlite3 /app/apps/aggregator/data/agg.db '.schema'"
  ```
  Six tables: `markets` · `price_history` · `intents` · `votes` · `fills` ·
  `uploads`.

## Source-of-truth for the demo claims

- **45-49 markets created at 8 AM ET**: `apps/aggregator/src/meridian/morning.ts`
  iterates `MAG7` × strike ladders from `apps/aggregator/src/meridian/constants.ts`
- **Settle at 4:05 PM ET**: `apps/aggregator/src/meridian/evening.ts` reads
  the day's close via `prices.ts` (Yahoo Finance), casts `MsgCastVote` per
  market signed by the oracle key (`fixtures/oracle.json` on the host)
- **Arb bot patterns**: `apps/aggregator/src/bot/arbitrage.ts` — three
  match patterns (both-buy-deposit, both-sell-redeem, same-side-cross),
  60s cooldown on failed approvals to avoid retry storms
- **Seeder ladder**: `apps/aggregator/src/bot/seeder.ts` — 108 intents per
  new market (9 prices × 4 directions × `[1, 5, 10]` token quantities)
- **Price formula**: `apps/aggregator/src/chain/events.ts`#`impliedYesPrice`
  — averages per-leg coin amounts on cross-match fills (a previous bug
  returned null for those, blocking the chart from updating after arbs)
