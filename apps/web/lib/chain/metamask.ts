'use client';

import { env } from '../env';

/**
 * Light MetaMask helpers. The SDK's `GenericEvmAdapter.fromBrowserWallet`
 * handles all the actual signing — this module is just for connect-time
 * concerns: detecting the provider, prompting chain-add, deriving the bb1
 * address from the connected eth account.
 *
 * IMPORTANT: chain-side accounting is in the bb1 (bech32 cosmos) form.
 * The 0x address is user-facing only — every balance, intent, vote lookup
 * must convert before hitting the chain.
 */

export function hasMetaMask(): boolean {
  if (typeof window === 'undefined') return false;
  const eth = (window as any).ethereum;
  return !!eth && (eth.isMetaMask || Array.isArray(eth.providers));
}

/**
 * Trigger the wallet's connect flow. Returns the connected 0x account.
 * No address conversion — that happens in `ethToBb` via the SDK so the
 * conversion matches the chain's `address-converter` exactly.
 */
export async function connectMetaMask(): Promise<{ ethAddress: string; bbAddress: string }> {
  if (!hasMetaMask()) throw new Error('MetaMask (or EIP-1193 provider) not detected.');
  const eth = (window as any).ethereum;

  // Make sure the wallet is on our chain. We try eth_switchEthereumChain first
  // and fall back to wallet_addEthereumChain when the chain isn't known to it.
  await ensureChain(eth);

  const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
  if (!accounts?.[0]) throw new Error('MetaMask returned no accounts');
  const ethAddress = accounts[0];
  const bbAddress = await ethToBb(ethAddress);
  return { ethAddress, bbAddress };
}

/**
 * Convert a 0x address to its bb1 form. Uses the SDK's address-converter
 * directly so it matches the chain's derivation exactly.
 */
export async function ethToBb(ethAddress: string): Promise<string> {
  const { convertToBitBadgesAddress } = await import('bitbadges');
  return convertToBitBadgesAddress(ethAddress);
}

async function ensureChain(eth: any): Promise<void> {
  const targetHex = '0x' + env.evmChainId.toString(16);
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetHex }],
    });
    return;
  } catch (err: any) {
    // 4902 = unknown chain — add it then switch.
    if (err?.code !== 4902) throw err;
  }
  await eth.request({
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
