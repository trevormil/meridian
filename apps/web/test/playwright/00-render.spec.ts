import { test, expect } from './fixtures';

/**
 * Smoke tests: every primary route renders without throwing and shows the
 * expected anchor text + key controls. Independent of wallet state — runs
 * with no persona connected.
 */

test('home: browse renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Prediction markets/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /\+ New market/i })).toBeVisible();
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
  // Two "Connect" buttons render (header + inline empty-state) — assert at
  // least one exists by counting rather than fighting strict-mode.
  const buttons = page.getByRole('button', { name: /Connect Keplr|Connect \(test\)/i });
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
