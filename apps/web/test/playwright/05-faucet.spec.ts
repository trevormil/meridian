import { test, expect } from './fixtures';

test.use({ aliceWallet: true });

/**
 * Faucet UX — verifies the card renders + claim works against the dev
 * aggregator's `/api/v0/faucet/{status,claim}` endpoints. Skipped if the
 * aggregator reports `enabled: false` (which means the chain hasn't been
 * restarted with the `faucet` account seeded yet).
 */

const AGG = process.env.NEXT_PUBLIC_AGGREGATOR_URL ?? 'http://localhost:4043';

test('faucet card renders + dispenses USDC', async ({ page, request }) => {
  // Pre-check the aggregator before we even build the page; cheaper to skip here.
  const status = await request.get(`${AGG}/api/v0/faucet/status`);
  const j = await status.json();
  test.skip(!j.enabled, `faucet disabled (${j.reason ?? 'unknown'}) — restart chain with PR #99 to enable`);

  await page.goto('/portfolio');
  await expect(page.getByTestId('wallet-name')).toHaveText('e2e-alice');

  // The card should appear on portfolio when aggregator reports enabled.
  const claim = page.getByRole('button', { name: /Claim \d+ USDC/i });
  await expect(claim).toBeVisible();
  await expect(claim).toBeEnabled();
  await claim.click();

  // Success banner shows the tx hash.
  await expect(page.getByText(/sent — tx [0-9a-f]/i)).toBeVisible({ timeout: 15_000 });
});
