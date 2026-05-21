import { test, expect, personas, impersonate } from './fixtures';

test('connect as alice via picker → header shows address', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('connect-test').click();
  await page.getByTestId('test-persona-e2e-alice').click();

  await expect(page.getByTestId('wallet-connected')).toBeVisible();
  await expect(page.getByTestId('wallet-name')).toHaveText('e2e-alice');
  const shortAlice = `${personas.alice.address.slice(0, 8)}…${personas.alice.address.slice(-4)}`;
  await expect(page.getByTestId('wallet-address-short')).toHaveText(shortAlice);
});

test('pre-impersonate via localStorage auto-connects on load', async ({ page }) => {
  await impersonate(page, personas.alice);
  await page.goto('/');
  await expect(page.getByTestId('wallet-connected')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('wallet-name')).toHaveText('e2e-alice');
});

test('disconnect clears header back to connect button', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('connect-test').click();
  await page.getByTestId('test-persona-e2e-bob').click();
  await expect(page.getByTestId('wallet-connected')).toBeVisible();
  await page.getByTestId('disconnect').click();
  await expect(page.getByTestId('connect-test')).toBeVisible();
});
