'use client';

// MUST run before importing 'bitbadges' — the SDK's compiled converter.js
// uses a literal `require('crypto')` inside a function body, which webpack
// can't rewrite (it doesn't see the call until runtime). We bridge that
// `require` to the bundled crypto-browserify so the browser bundle resolves.
import * as cryptoBrowserify from 'crypto-browserify';
import { Buffer as BufferShim } from 'buffer';
if (typeof window !== 'undefined') {
  const w = window as any;
  if (!w.Buffer) w.Buffer = BufferShim;
  if (typeof w.require !== 'function') {
    w.require = (mod: string) => {
      if (mod === 'crypto') return cryptoBrowserify;
      if (mod === 'buffer') return { Buffer: BufferShim };
      throw new Error(`test-wallet shim: unsupported require("${mod}") in browser`);
    };
  }
}

import { GenericCosmosAdapter } from 'bitbadges';
import { env } from '../env';

/**
 * In TEST_MODE we replace Keplr with a mnemonic-based signer so Playwright
 * specs can drive the FE end-to-end without a browser extension. The signer
 * uses cosmjs DirectSecp256k1HdWallet under the hood (browser-safe).
 *
 * Personas are bundled at build time via NEXT_PUBLIC_TEST_PERSONAS — same
 * mnemonics the aggregator e2e suite uses. The active persona is selected
 * via localStorage so the Playwright fixture can switch between them.
 */

export interface TestPersona {
  name: string;
  address: string;
  mnemonic: string;
}

const STORAGE_ACTIVE_KEY = 'bitbadges-pm.test.activePersona';

export function isTestMode(): boolean {
  return process.env.NEXT_PUBLIC_TEST_MODE === 'true';
}

export function loadTestPersonas(): TestPersona[] {
  const raw = process.env.NEXT_PUBLIC_TEST_PERSONAS;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TestPersona[];
  } catch {
    return [];
  }
}

export function getActivePersonaName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_ACTIVE_KEY);
}

export function setActivePersonaName(name: string | null): void {
  if (typeof window === 'undefined') return;
  if (name) localStorage.setItem(STORAGE_ACTIVE_KEY, name);
  else localStorage.removeItem(STORAGE_ACTIVE_KEY);
}

/**
 * Build a signing adapter for the named test persona. Resolves the persona
 * from the bundle, then wraps it in GenericCosmosAdapter.fromMnemonic.
 */
export async function testAdapterFor(personaName: string): Promise<{
  adapter: GenericCosmosAdapter;
  persona: TestPersona;
}> {
  const personas = loadTestPersonas();
  const persona = personas.find((p) => p.name === personaName);
  if (!persona) {
    throw new Error(
      `Test persona "${personaName}" not in bundle. Available: ${personas.map((p) => p.name).join(', ') || '(none)'}`,
    );
  }
  const adapter = await GenericCosmosAdapter.fromMnemonic(persona.mnemonic, env.chainId);
  return { adapter, persona };
}
