'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { connectKeplr, hasKeplr } from '@/lib/chain/keplr';
import { connectMetaMask, hasMetaMask, ethToBb } from '@/lib/chain/metamask';
import { clearSigningClient, setSignMode, type SignMode } from '@/lib/chain/broadcast';
import {
  isTestMode,
  loadTestPersonas,
  getActivePersonaName,
  setActivePersonaName,
  testAdapterFor,
  type TestPersona,
} from '@/lib/chain/test-wallet';

export type WalletKind = 'keplr' | 'metamask' | 'test';

interface WalletState {
  /** bb1… cosmos address (used for all chain-side lookups). */
  address: string | null;
  /** 0x… EVM address when connected via MetaMask. Display-only — every chain
   *  call must convert to `address` (bb1) first. */
  ethAddress: string | null;
  name: string | null;
  kind: WalletKind | null;
  connecting: boolean;
  error: string | null;
}

interface WalletApi extends WalletState {
  /** Default connect — opens the picker (Keplr in prod, persona in test). */
  connect: () => Promise<void>;
  connectKeplr: () => Promise<void>;
  connectMetaMask: () => Promise<void>;
  /** In TEST_MODE: connect as a specific named persona. */
  connectAs?: (personaName: string) => Promise<void>;
  disconnect: () => void;
  testMode: boolean;
  testPersonas: TestPersona[];
}

const Ctx = createContext<WalletApi | null>(null);

const STORAGE_KEY = 'bitbadges-pm.wallet';
const STORAGE_PERSONA_KEY = 'bitbadges-pm.wallet.persona';
const STORAGE_KIND_KEY = 'bitbadges-pm.wallet.kind';

const EMPTY: WalletState = {
  address: null,
  ethAddress: null,
  name: null,
  kind: null,
  connecting: false,
  error: null,
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>(EMPTY);
  const testMode = isTestMode();
  const testPersonas = useMemo(() => (testMode ? loadTestPersonas() : []), [testMode]);

  const setMode = (m: SignMode) => setSignMode(m);

  const connectAsPersona = useCallback(async (personaName: string) => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const { persona } = await testAdapterFor(personaName);
      setActivePersonaName(persona.name);
      setMode('test');
      clearSigningClient();
      setState({ ...EMPTY, address: persona.address, name: persona.name, kind: 'test' });
      localStorage.setItem(STORAGE_KEY, persona.address);
      localStorage.setItem(STORAGE_PERSONA_KEY, persona.name);
      localStorage.setItem(STORAGE_KIND_KEY, 'test');
    } catch (e) {
      setState({ ...EMPTY, error: (e as Error).message });
    }
  }, []);

  const doConnectKeplr = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const { address, name } = await connectKeplr();
      setMode('keplr');
      clearSigningClient();
      setState({ ...EMPTY, address, name, kind: 'keplr' });
      localStorage.setItem(STORAGE_KEY, address);
      localStorage.setItem(STORAGE_KIND_KEY, 'keplr');
    } catch (e) {
      setState({ ...EMPTY, error: (e as Error).message });
    }
  }, []);

  const doConnectMetaMask = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const { ethAddress, bbAddress } = await connectMetaMask();
      setMode('metamask');
      clearSigningClient();
      // EVM-signed txs flow through MsgEthereumTx but all chain-side state is
      // keyed by the bb1 form — every chain query/balance/intent must use that.
      setState({
        ...EMPTY,
        address: bbAddress,
        ethAddress,
        name: 'MetaMask',
        kind: 'metamask',
      });
      localStorage.setItem(STORAGE_KEY, bbAddress);
      localStorage.setItem(STORAGE_KIND_KEY, 'metamask');
    } catch (e) {
      setState({ ...EMPTY, error: (e as Error).message });
    }
  }, []);

  const connect = useCallback(async () => {
    if (testMode) {
      const first = loadTestPersonas()[0];
      if (!first) {
        setState((s) => ({ ...s, error: 'No test personas bundled. Set NEXT_PUBLIC_TEST_PERSONAS.' }));
        return;
      }
      await connectAsPersona(first.name);
      return;
    }
    // Default to Keplr — the persona/MetaMask picker components let the user
    // explicitly choose; this default keeps the existing UX for users with
    // only Keplr installed.
    if (hasKeplr()) return doConnectKeplr();
    if (hasMetaMask()) return doConnectMetaMask();
    setState((s) => ({ ...s, error: 'No wallet detected (install Keplr or MetaMask).' }));
  }, [testMode, connectAsPersona, doConnectKeplr, doConnectMetaMask]);

  const disconnect = useCallback(() => {
    clearSigningClient();
    setActivePersonaName(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_PERSONA_KEY);
    localStorage.removeItem(STORAGE_KIND_KEY);
    setState(EMPTY);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedAddr = localStorage.getItem(STORAGE_KEY);
    if (!savedAddr) return;
    const savedKind = (localStorage.getItem(STORAGE_KIND_KEY) ?? '') as WalletKind | '';

    if (testMode) {
      const name = localStorage.getItem(STORAGE_PERSONA_KEY) ?? getActivePersonaName();
      if (name) connectAsPersona(name).catch(() => {});
      return;
    }
    if (savedKind === 'metamask' && hasMetaMask()) {
      // Re-derive bb1 from current eth account silently. Skip prompts.
      (async () => {
        try {
          const accs: string[] = await (window as any).ethereum.request({ method: 'eth_accounts' });
          if (!accs?.[0]) return;
          const bbAddress = await ethToBb(accs[0]);
          setMode('metamask');
          setState({ ...EMPTY, address: bbAddress, ethAddress: accs[0], name: 'MetaMask', kind: 'metamask' });
        } catch {
          // user not connected — keep disconnected state
        }
      })();
      return;
    }
    if (hasKeplr()) doConnectKeplr().catch(() => {});
  }, [testMode, connectAsPersona, doConnectKeplr]);

  const value = useMemo<WalletApi>(
    () => ({
      ...state,
      connect,
      connectKeplr: doConnectKeplr,
      connectMetaMask: doConnectMetaMask,
      connectAs: testMode ? connectAsPersona : undefined,
      disconnect,
      testMode,
      testPersonas,
    }),
    [state, connect, doConnectKeplr, doConnectMetaMask, connectAsPersona, disconnect, testMode, testPersonas],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWallet must be used within WalletProvider');
  return v;
}
