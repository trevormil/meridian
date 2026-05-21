import { test as base, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Persona {
  name: string;
  address: string;
  mnemonic: string;
}

const personasObj = JSON.parse(
  readFileSync(resolve(__dirname, '../../../aggregator/test/e2e/fixtures/personas.json'), 'utf8'),
) as Record<string, Persona>;

export const personas = {
  alice: personasObj.alice,
  bob: personasObj.bob,
};

/**
 * Pre-set the active persona via localStorage before any page script runs, so
 * WalletContext's auto-reconnect picks it up on first render. Used by both
 * the dedicated impersonation helper and the wallet-named fixtures below.
 * Exported so tests can call it directly when they don't want to wrap the
 * whole file in `test.use({...})`.
 */
export async function impersonate(page: Page, persona: Persona): Promise<void> {
  await page.addInitScript(([address, name]) => {
    try {
      localStorage.setItem('bitbadges-pm.wallet', address);
      localStorage.setItem('bitbadges-pm.wallet.persona', name);
      localStorage.setItem('bitbadges-pm.test.activePersona', name);
    } catch {
      // localStorage may not be available yet — non-fatal, the persona picker
      // is still available as a fallback path.
    }
  }, [persona.address, persona.name]);
}

/**
 * Boolean test options: declare `test.use({ aliceWallet: true })` (or `bobWallet`)
 * in a spec file and the fixture auto-impersonates that persona on every
 * page-fixture creation. Defaults to false so opt-in is explicit.
 */
type WalletOptions = {
  aliceWallet: boolean;
  bobWallet: boolean;
};

export const test = base.extend<WalletOptions>({
  aliceWallet: [false, { option: true }],
  bobWallet: [false, { option: true }],

  // Wrap the built-in `page` fixture so impersonation lands BEFORE the test's
  // first navigation. addInitScript only takes effect on subsequent loads, so
  // wrapping here ensures every page in this spec auto-connects.
  page: async ({ page, aliceWallet, bobWallet }, use) => {
    if (aliceWallet) await impersonate(page, personas.alice);
    else if (bobWallet) await impersonate(page, personas.bob);
    await use(page);
  },
});

export { expect } from '@playwright/test';
