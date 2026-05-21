# Frontend Playwright suite

Smoke + flow coverage of the standalone prediction-market FE. Drives the
**production build** (`next build && next start`) rather than `next dev` —
catches build-time bugs and gets close to what users see.

## Prerequisites

1. Chain running locally (`cr`) with the e2e personas seeded (PR #98/#99).
2. SDK linked into `apps/web/` via `bun link bitbadges` (already wired by repo setup).
3. Playwright browsers installed:
   ```bash
   cd apps/web
   npx playwright install chromium
   ```

## Run

```bash
cd apps/web
bun run test:pw          # headless
bun run test:pw:ui       # Playwright inspector UI
```

The global setup:
1. Verifies the chain LCD is reachable at `localhost:1317`
2. Spawns a **dedicated aggregator** on port 4043 with `data-playwright/` dir
3. Builds the FE with `NEXT_PUBLIC_TEST_MODE=true` and the persona mnemonics bundled
4. Starts `next start` on port 3042

Global teardown kills the aggregator on suite completion.

## Test mode behaviour

When the FE detects `NEXT_PUBLIC_TEST_MODE=true`:
- `WalletContext` exposes the test personas (from `NEXT_PUBLIC_TEST_PERSONAS`)
- The Connect button shows a **persona picker dropdown** instead of triggering Keplr
- `getSigningClient()` uses `GenericCosmosAdapter.fromMnemonic(persona.mnemonic, chainId)`
- All sign/broadcast goes through the same SDK signing flow — just without browser-extension prompts

Playwright's `impersonate(page, persona)` fixture pre-sets the active persona
in `localStorage` so pages auto-connect on load (no clicks needed).

## Specs

| File | Coverage |
|---|---|
| `00-render.spec.ts` | every primary route renders + key controls present (no wallet) |
| `01-connect.spec.ts` | persona-picker flow, auto-connect via localStorage, disconnect |
| `02-create-market.spec.ts` | verifier auto-default to connected wallet, "Use me" reset, deploy enable rules |
| `03-market-detail.spec.ts` | header + 5 tabs render, tab switching reveals each panel |
| `04-flows.spec.ts` | create → browse appearance → deposit (asserts via aggregator API) |

Order matters — `04-flows.spec.ts` seeds the test market, others read it. Specs
run serially (workers=1) because chain state is shared.

## Failure artifacts

On failure, Playwright keeps the trace + screenshot under `test-results/`.
Open the trace with `npx playwright show-trace test-results/.../trace.zip`.

## Why not test EVERY flow?

Deeper assertion coverage (fill, redeem, settlement, push) lives in the
**aggregator e2e suite** under `apps/aggregator/test/e2e/`, which talks to the
chain directly without a browser. Playwright's job here is to verify the FE
renders correctly + key buttons work; the heavy chain-state invariants are
already covered.
