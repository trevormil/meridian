import { test, expect } from './fixtures';

test.use({ aliceWallet: true });

test('create form: verifier auto-defaults to connected wallet', async ({ page }) => {
  await page.goto('/create');
  // Wait for wallet to auto-connect from localStorage.
  await expect(page.getByTestId('wallet-name')).toHaveText('e2e-alice');

  // Verifier input should auto-populate with alice's full address.
  const verifierInput = page.locator('input[placeholder="bb1…"]');
  await expect(verifierInput).toHaveValue(/^bb1/);

  // Hint flips to the "defaulted to your wallet" copy.
  await expect(page.getByText(/Defaulted to your connected wallet/i)).toBeVisible();
});

test('create form: typed-over verifier shows "Use me" reset button', async ({ page }) => {
  await page.goto('/create');
  await expect(page.getByTestId('wallet-name')).toHaveText('e2e-alice');

  const verifierInput = page.locator('input[placeholder="bb1…"]');
  await verifierInput.fill('bb1somethingelseentirelyabcdefghij1234');
  await expect(page.getByRole('button', { name: /Use me/i })).toBeVisible();

  await page.getByRole('button', { name: /Use me/i }).click();
  await expect(verifierInput).toHaveValue(/^bb1sdt4dnq/);
});

test('create form: deploy button enables when name + verifier valid', async ({ page }) => {
  await page.goto('/create');
  await expect(page.getByTestId('wallet-name')).toHaveText('e2e-alice');

  const deploy = page.getByRole('button', { name: /Deploy market/i });
  await expect(deploy).toBeDisabled();

  await page.getByPlaceholder(/Will X happen by Y/i).fill('Playwright test market');
  await expect(deploy).toBeEnabled();
});
