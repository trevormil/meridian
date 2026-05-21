'use client';

import { env } from '../env';

// Minimal subset of the Keplr window interface we touch.
interface KeplrWindow {
  experimentalSuggestChain: (info: unknown) => Promise<void>;
  enable: (chainId: string) => Promise<void>;
  getKey: (chainId: string) => Promise<{ name: string; bech32Address: string; pubKey: Uint8Array }>;
}

declare global {
  interface Window {
    keplr?: KeplrWindow;
  }
}

function chainInfo() {
  return {
    chainId: env.chainId,
    chainName: env.chainId === 'bitbadges-1' ? 'BitBadges' : 'BitBadges Local',
    rpc: env.rpcUrl,
    rest: env.lcdUrl,
    bip44: { coinType: 118 },
    bech32Config: {
      bech32PrefixAccAddr: 'bb',
      bech32PrefixAccPub: 'bbpub',
      bech32PrefixValAddr: 'bbvaloper',
      bech32PrefixValPub: 'bbvaloperpub',
      bech32PrefixConsAddr: 'bbvalcons',
      bech32PrefixConsPub: 'bbvalconspub',
    },
    currencies: [{ coinDenom: 'BADGE', coinMinimalDenom: 'ubadge', coinDecimals: 9 }],
    feeCurrencies: [
      {
        coinDenom: 'BADGE',
        coinMinimalDenom: 'ubadge',
        coinDecimals: 9,
        gasPriceStep: { low: 0.01, average: 0.025, high: 0.03 },
      },
    ],
    stakeCurrency: { coinDenom: 'BADGE', coinMinimalDenom: 'ubadge', coinDecimals: 9 },
  };
}

export async function connectKeplr(): Promise<{ address: string; name: string }> {
  if (!window.keplr) throw new Error('Keplr extension not detected');
  try {
    await window.keplr.experimentalSuggestChain(chainInfo());
  } catch (e) {
    // Some Keplr setups already have the chain — ignore failures here.
  }
  await window.keplr.enable(env.chainId);
  const key = await window.keplr.getKey(env.chainId);
  return { address: key.bech32Address, name: key.name };
}

export function hasKeplr(): boolean {
  return typeof window !== 'undefined' && !!window.keplr;
}
