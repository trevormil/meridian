import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export interface Persona {
  name: string;
  address: string;
  mnemonic: string;
}

const FIXTURE_PATH = resolve(__dirname, '../fixtures/personas.json');

let _cached: { alice: Persona; bob: Persona } | null = null;

export function loadPersonas(): { alice: Persona; bob: Persona } {
  if (_cached) return _cached;
  let raw: string;
  try {
    raw = readFileSync(FIXTURE_PATH, 'utf8');
  } catch {
    throw new Error(
      `Missing personas fixture at ${FIXTURE_PATH}. Run \`bitbadgeschaind keys add e2e-alice --keyring-backend test --output json\` (and bob), copy the mnemonics into the fixture file, and ensure the chain config seeds these addresses.`,
    );
  }
  _cached = JSON.parse(raw) as { alice: Persona; bob: Persona };
  return _cached;
}
