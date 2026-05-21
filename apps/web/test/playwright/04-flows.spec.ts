import { test, expect } from './fixtures';

test.use({ aliceWallet: true });

/**
 * Full create → deposit → trade flow through the UI. Each step asserts the
 * resulting state via the aggregator's API (rather than the rendered DOM)
 * because the FE doesn't refetch instantly — the API is the source of truth
 * for chain-derived state.
 */

const AGG = process.env.NEXT_PUBLIC_AGGREGATOR_URL ?? 'http://localhost:4043';
const MARKET_NAME = `pw-flow-${Date.now()}`;

async function fetchPredictions(request: any): Promise<any[]> {
  const r = await request.get(`${AGG}/api/v0/predictions`);
  return r.ok() ? (await r.json()).predictions ?? [] : [];
}

test('alice can create a market via the UI', async ({ page, request }) => {
  // Capture EVERY browser message so silent failures (caught exceptions, eaten
  // promise rejections in the SDK signing flow) become visible.
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}\n${(e.stack ?? '').slice(0, 600)}`));
  page.on('console', (m) => {
    consoleErrors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('requestfailed', (r) => consoleErrors.push(`[reqfail] ${r.url()} → ${r.failure()?.errorText}`));

  await page.goto('/create');
  await expect(page.getByTestId('wallet-name')).toHaveText('e2e-alice');

  await page.getByPlaceholder(/Will X happen by Y/i).fill(MARKET_NAME);
  await page.getByPlaceholder(/sources or events/i).fill('Playwright e2e');
  // SDK requires alias-path metadata to have an image. Without it,
  // buildPredictionMarket throws MetadataMissingError silently inside the
  // tx-build phase and the deploy click looks like a no-op.
  await page.getByPlaceholder(/https:/i).fill('https://example.com/pw-test.png');

  const deploy = page.getByRole('button', { name: /Deploy market/i });
  await expect(deploy).toBeEnabled();
  await deploy.click();

  // The form redirects to / after the tx commits. MsgUniversalUpdateCollection
  // is heavier than a simple transfer but still well under the timeout.
  await page.waitForURL(/\/$/, { timeout: 45_000 }).catch(async () => {
    // Redirect didn't fire — dump enough to diagnose.
    const errBox = await page.getByTestId('wallet-error').textContent().catch(() => null);
    throw new Error(
      `Deploy click did not redirect. url=${page.url()} errorBox=${errBox} ` +
      `consoleErrors=${JSON.stringify(consoleErrors.slice(0, 5))}`,
    );
  });

  // Aggregator should index the new market within a couple block-ticks.
  await expect
    .poll(
      async () => (await fetchPredictions(request)).some((m) => m.name === MARKET_NAME),
      { timeout: 20_000, intervals: [500, 1000, 1500, 2000] },
    )
    .toBe(true);
});

test('the new market shows on the browse page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(MARKET_NAME).first()).toBeVisible({ timeout: 30_000 });
});

test('alice can deposit on the new market', async ({ page, request }) => {
  const markets = await fetchPredictions(request);
  const market = markets.find((m) => m.name === MARKET_NAME);
  test.skip(!market, 'Create-market spec did not seed the test market');
  await page.goto(`/markets/${market!.collectionId}`);

  await page.getByRole('button', { name: 'Deposit' }).click();
  const amountInput = page.locator('input[type="number"]').first();
  await amountInput.fill('5');

  // Click the deposit button (label updates as you type).
  const depositBtn = page.getByRole('button', { name: /Deposit 5 USDC/i });
  await expect(depositBtn).toBeEnabled();
  await depositBtn.click();

  // Aggregator total_deposited should reach ~5 USDC base units (5_000_000) within ~10s.
  await expect.poll(
    async () => {
      const m = (await fetchPredictions(request)).find((mm) => mm.collectionId === market!.collectionId);
      return m ? BigInt(m.totalDeposited) >= 4_500_000n : false;
    },
    { timeout: 30_000, intervals: [1000, 1500, 2000] },
  ).toBe(true);
});
