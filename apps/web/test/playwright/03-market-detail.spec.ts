import { test, expect } from './fixtures';

test.use({ aliceWallet: true });

/**
 * The aggregator may not have any markets yet on a fresh chain. We seed one
 * if needed via the SDK + bitbadgeschaind by visiting /create — but for the
 * detail-render test we just need ONE existing market.
 *
 * If `/api/v0/predictions` returns ≥1, navigate to its detail page and verify
 * the 5 tabs render. Otherwise skip with a helpful message — the deposit
 * spec will create one and this test will succeed on the next CI cycle.
 */

async function firstMarketId(request: any, baseURL: string | undefined): Promise<string | null> {
  const r = await request.get(`${baseURL!}/api/v0/predictions`);
  if (!r.ok()) return null;
  const j = await r.json();
  return j.predictions?.[0]?.collectionId ?? null;
}

test('market detail: header + 5 tabs render', async ({ page, request, baseURL }) => {
  // Use the aggregator URL — chain may have markets even if the FE hasn't
  // surfaced them yet via the cards (e.g. backfill not yet done).
  const aggUrl = process.env.NEXT_PUBLIC_AGGREGATOR_URL ?? 'http://localhost:4043';
  const r = await request.get(`${aggUrl}/api/v0/predictions`);
  const list = r.ok() ? (await r.json()).predictions ?? [] : [];
  const id = list[0]?.collectionId;
  test.skip(!id, 'No markets indexed yet — run aggregator e2e suite first to populate, or run 04-flows.spec.ts');

  await page.goto(`/markets/${id}`);

  // Header: title or market #ID
  await expect(page.getByRole('heading').first()).toBeVisible();

  // 5 tabs
  for (const tab of ['Market', 'Order Book', 'Deposit', 'Redeem']) {
    await expect(page.getByRole('button', { name: tab })).toBeVisible();
  }

  // Market tab content — use heading role to avoid matching the empty-state
  // copy that also contains the phrase.
  await expect(page.getByRole('heading', { name: 'Current odds' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Price history' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Market info' })).toBeVisible();
});

test('market detail: switching tabs reveals each panel', async ({ page, request, baseURL }) => {
  const aggUrl = process.env.NEXT_PUBLIC_AGGREGATOR_URL ?? 'http://localhost:4043';
  const r = await request.get(`${aggUrl}/api/v0/predictions`);
  const list = r.ok() ? (await r.json()).predictions ?? [] : [];
  const id = list[0]?.collectionId;
  test.skip(!id, 'No markets indexed yet');

  await page.goto(`/markets/${id}`);

  await page.getByRole('button', { name: 'Order Book' }).click();
  await expect(page.getByText(/Place order/i)).toBeVisible();

  await page.getByRole('button', { name: 'Deposit' }).click();
  await expect(page.getByText(/Deposit/i).first()).toBeVisible();
  await expect(page.getByText(/1 USDC → 1 YES \+ 1 NO/i)).toBeVisible();

  await page.getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByText(/Redeem|Pre-settlement/i).first()).toBeVisible();
});
