import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = Number(process.env.PW_WEB_PORT ?? 3042);
const AGG_PORT = Number(process.env.PW_AGG_PORT ?? 4043);

// Load personas from the aggregator's fixture so both suites share the same
// keys (so e2e + Playwright can run against the same seeded chain).
const personasPath = resolve(__dirname, '../aggregator/test/e2e/fixtures/personas.json');
const personasObj = JSON.parse(readFileSync(personasPath, 'utf8')) as Record<string, { name: string; address: string; mnemonic: string }>;
const personasArr = Object.values(personasObj);
process.env.NEXT_PUBLIC_TEST_MODE = 'true';
process.env.NEXT_PUBLIC_TEST_PERSONAS = JSON.stringify(personasArr);
process.env.NEXT_PUBLIC_AGGREGATOR_URL = `http://localhost:${AGG_PORT}`;
process.env.NEXT_PUBLIC_LCD_URL = process.env.PW_LCD_URL ?? 'http://localhost:1317';
process.env.NEXT_PUBLIC_RPC_URL = process.env.PW_RPC_URL ?? 'http://localhost:26657';

export default defineConfig({
  testDir: './test/playwright',
  fullyParallel: false, // chain state is shared — serialize specs
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    // Build once, then serve the production bundle. Matches what the user asked
    // for — Playwright runs against the actual build, not next dev.
    command: `bun run build && bun run start -- -p ${PORT}`,
    port: PORT,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      PORT: String(PORT),
      NEXT_PUBLIC_TEST_MODE: 'true',
      NEXT_PUBLIC_TEST_PERSONAS: JSON.stringify(personasArr),
      NEXT_PUBLIC_AGGREGATOR_URL: `http://localhost:${AGG_PORT}`,
      NEXT_PUBLIC_LCD_URL: process.env.NEXT_PUBLIC_LCD_URL!,
      NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL!,
    },
  },
  globalSetup: require.resolve('./test/playwright/global-setup'),
  globalTeardown: require.resolve('./test/playwright/global-teardown'),
});
