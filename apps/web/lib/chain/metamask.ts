'use client';

import { createStore as createMipdStore, type EIP6963ProviderDetail } from 'mipd';
import { env } from '../env';

/**
 * MetaMask connect helpers. Uses EIP-6963 multi-injected-provider discovery
 * (via `mipd`) so we pick the *real* MetaMask even when another extension
 * (Coinbase Wallet, Rabby, Phantom-EVM, etc.) hijacks `window.ethereum`.
 *
 * IMPORTANT: chain-side accounting is in the bb1 (bech32 cosmos) form.
 * The 0x address is user-facing only — every balance / intent / vote lookup
 * must convert before hitting the chain.
 */

const METAMASK_RDNS = 'io.metamask';

let _store: ReturnType<typeof createMipdStore> | null = null;

function getStore() {
  if (typeof window === 'undefined') return null;
  if (!_store) _store = createMipdStore();
  return _store;
}

/** EIP-6963 entry whose rdns is exactly io.metamask. Falls back to scanning
 *  legacy `window.ethereum.providers` (older MetaMask extension versions) and
 *  finally `window.ethereum` if it self-identifies as MetaMask. */
function findMetaMaskProvider(): EIP6963ProviderDetail | { provider: any } | null {
  const store = getStore();
  const eip6963 = store?.findProvider({ rdns: METAMASK_RDNS });
  if (eip6963) return eip6963;

  if (typeof window === 'undefined') return null;
  const eth = (window as any).ethereum;
  if (!eth) return null;

  // Legacy multi-provider shim: window.ethereum.providers is an array when
  // multiple extensions are installed (pre-EIP-6963 fallback).
  if (Array.isArray(eth.providers)) {
    const mm = eth.providers.find((p: any) => p.isMetaMask && !p.isCoinbaseWallet && !p.isPhantom);
    if (mm) return { provider: mm };
  }

  // Single-extension case where window.ethereum IS MetaMask.
  if (eth.isMetaMask && !eth.isCoinbaseWallet && !eth.isPhantom && !eth.isRabby) {
    return { provider: eth };
  }
  return null;
}

export function hasMetaMask(): boolean {
  return findMetaMaskProvider() !== null;
}

export async function connectMetaMask(): Promise<{ ethAddress: string; bbAddress: string }> {
  const found = findMetaMaskProvider();
  if (!found) {
    throw new Error(
      'MetaMask not detected. If you have Coinbase Wallet / Rabby / Phantom installed alongside MetaMask, ' +
      'make sure MetaMask is enabled and that you have the latest version (EIP-6963 support).',
    );
  }
  const provider = (found as any).provider;

  // STEP 1: request accounts. MetaMask requires this before chain ops on a
  // fresh session, and putting it first means the familiar Connect popup
  // appears before any chain-add/switch prompt.
  let accounts: string[];
  try {
    accounts = await provider.request({ method: 'eth_requestAccounts' });
  } catch (err: any) {
    if (err?.code === 4001) {
      throw new Error('MetaMask connect rejected — click "Connect" in the popup to grant access.');
    }
    throw new Error(`MetaMask account request failed: ${err?.message ?? err}`);
  }
  if (!accounts?.[0]) throw new Error('MetaMask returned no accounts');

  // STEP 2: make sure we're on our chain. Skip switch if already there.
  try {
    await ensureChain(provider);
  } catch (err: any) {
    const code = err?.code;
    if (code === 4001) {
      throw new Error(
        `Chain switch rejected — accept "Switch network" (or "Approve adding network") in MetaMask for chain ${env.evmChainId}.`,
      );
    }
    throw new Error(
      `MetaMask chain setup failed (code=${code}): ${err?.message ?? err}. ` +
      `Check that the EVM RPC at ${env.evmRpcUrl} is reachable from your browser.`,
    );
  }

  // STEP 3: pin the chosen provider on `window.ethereum` so the SDK's
  // GenericEvmAdapter.fromBrowserWallet — which reads `window.ethereum` —
  // picks up THIS provider rather than whichever extension hijacked it.
  // Restored to its previous value on disconnect.
  (window as any).__bbPrevEthereum = (window as any).ethereum;
  (window as any).ethereum = provider;

  const ethAddress = accounts[0];
  const bbAddress = await ethToBb(ethAddress);
  return { ethAddress, bbAddress };
}

export function unpinMetaMaskProvider(): void {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__bbPrevEthereum !== undefined) {
    w.ethereum = w.__bbPrevEthereum;
    delete w.__bbPrevEthereum;
  }
}

export async function ethToBb(ethAddress: string): Promise<string> {
  const { convertToBitBadgesAddress } = await import('bitbadges');
  return convertToBitBadgesAddress(ethAddress);
}

async function ensureChain(provider: any): Promise<void> {
  const targetHex = '0x' + env.evmChainId.toString(16);
  try {
    const current: string = await provider.request({ method: 'eth_chainId' });
    if (current?.toLowerCase() === targetHex.toLowerCase()) return;
  } catch {
    // fall through to switch flow
  }
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetHex }],
    });
    return;
  } catch (err: any) {
    if (err?.code !== 4902 && err?.code !== -32603) throw err;
  }
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: targetHex,
        chainName: env.evmChainName,
        nativeCurrency: { name: env.evmCurrencySymbol, symbol: env.evmCurrencySymbol, decimals: 18 },
        rpcUrls: [env.evmRpcUrl],
      },
    ],
  });
}
