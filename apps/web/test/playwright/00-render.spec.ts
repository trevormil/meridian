import { test, expect } from './fixtures';

/**
 * Smoke tests: every primary route renders without throwing and shows the
 * expected anchor text + key controls. Independent of wallet state — runs
 * with no persona connected.
 */

test('home: browse renders', async ({ page }) => {
  await page.goto('/');
  // Browse hero heading: "Markets" in Fraunces serif (post-Meridian rebrand).
  await expect(page.getByRole('heading', { name: /^Markets$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Create market/i })).toBeVisible();
});

test('create: form fields render', async ({ page }) => {
  await page.goto('/create');
  await expect(page.getByRole('heading', { name: /Create a prediction market/i })).toBeVisible();
  await expect(page.getByPlaceholder(/Will X happen by Y/i)).toBeVisible();
  await expect(page.getByPlaceholder(/bb1…/i)).toBeVisible();
  // Deploy button is disabled until a wallet connects + form is valid.
  await expect(page.getByRole('button', { name: /Deploy market/i })).toBeDisabled();
});

test('portfolio: connect prompt when disconnected', async ({ page }) => {
  await page.goto('/portfolio');
  await expect(page.getByText(/Connect a wallet/i)).toBeVisible();
  // Header + inline empty-state both render a connect CTA. We match either
  // the unified "Connect wallet" CTA OR the TEST_MODE "Connect (test)"
  // variant depending on which mode the suite is running in.
  const buttons = page.getByRole('button', { name: /Connect wallet|Connect \(test\)/i });
  expect(await buttons.count()).toBeGreaterThanOrEqual(1);
});

test('connect button shows test-persona menu in TEST_MODE', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByTestId('connect-test');
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByTestId('test-persona-menu')).toBeVisible();
  await expect(page.getByTestId('test-persona-e2e-alice')).toBeVisible();
  await expect(page.getByTestId('test-persona-e2e-bob')).toBeVisible();
});
