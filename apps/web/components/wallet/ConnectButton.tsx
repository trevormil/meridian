'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/contexts/WalletContext';
import { Button } from '@/components/ui/Button';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { WalletLogo } from '@/components/ui/WalletLogo';
import { shortAddr } from '@/lib/format';
import { hasKeplr } from '@/lib/chain/keplr';
import { hasMetaMask } from '@/lib/chain/metamask';

export function ConnectButton() {
  const w = useWallet();
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  if (!w.address) {
    // Test mode keeps its own persona-picker UI (Playwright relies on these
    // testids), shown above the regular wallet menu.
    if (w.testMode && w.testPersonas.length > 0) {
      return (
        <div className="relative">
          {w.error && (
            <div
              data-testid="wallet-error"
              className="absolute right-0 top-full mt-1 z-50 max-w-xs rounded border border-no/40 bg-no/10 p-2 text-xs text-no"
            >
              {w.error}
            </div>
          )}
          <Button
            onClick={() => setShowMenu((s) => !s)}
            loading={w.connecting}
            size="sm"
            data-testid="connect-test"
          >
            Connect (test)
          </Button>
          {showMenu && (
            <div
              data-testid="test-persona-menu"
              className="absolute right-0 top-full mt-1 z-50 flex flex-col gap-1 rounded-lg border border-border bg-panel-2 p-2 shadow-lift"
            >
              {w.testPersonas.map((p) => (
                <button
                  key={p.name}
                  onClick={() => {
                    setShowMenu(false);
                    w.connectAs?.(p.name);
                  }}
                  data-testid={`test-persona-${p.name}`}
                  className="flex items-center gap-2 rounded px-3 py-1.5 text-left text-sm hover:bg-border"
                >
                  <WalletLogo kind="test" size={20} />
                  <span>
                    <span className="block font-medium">{p.name}</span>
                    <AddressDisplay address={p.address} size={12} copyable={false} className="text-muted" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    const keplrAvail = hasKeplr();
    const mmAvail = hasMetaMask();

    return (
      <div className="relative">
        {w.error && (
          <div
            data-testid="wallet-error"
            className="absolute right-0 top-full mt-1 z-50 max-w-xs rounded border border-no/40 bg-no/10 p-2 text-xs text-no"
          >
            {w.error}
          </div>
        )}
        <Button
          onClick={() => setShowMenu((s) => !s)}
          loading={w.connecting}
          size="sm"
          data-testid="connect-button"
        >
          Connect wallet
        </Button>
        {showMenu && (
          <div
            data-testid="wallet-menu"
            className="absolute right-0 top-full mt-1 z-50 flex w-56 flex-col gap-1 rounded-lg border border-border bg-panel-2 p-2 shadow-lift"
          >
            <WalletRow
              kind="keplr"
              label="Keplr"
              disabled={!keplrAvail}
              onClick={() => {
                setShowMenu(false);
                w.connectKeplr();
              }}
              testid="connect-keplr"
            />
            <WalletRow
              kind="metamask"
              label="MetaMask"
              disabled={!mmAvail}
              onClick={() => {
                setShowMenu(false);
                w.connectMetaMask();
              }}
              testid="connect-metamask"
            />
          </div>
        )}
      </div>
    );
  }

  async function copy() {
    if (!w.address) return;
    // Copy what's visually shown — ETH 0x for MetaMask, bb1 otherwise.
    const toCopy = w.ethAddress ?? w.address;
    try {
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // browser blocked clipboard — silently no-op
    }
  }

  // Network/wallet label doubles as a dual-wallet hint (EVM vs Cosmos).
  const kindLabel =
    w.kind === 'metamask' ? 'MetaMask · EVM' : w.kind === 'keplr' ? 'Keplr · Cosmos' : 'Test wallet';

  return (
    <div className="relative" data-testid="wallet-connected">
      {/* Hidden testid carrying the persona name (Playwright reads it). */}
      <span className="sr-only" data-testid="wallet-name">
        {w.name ?? ''}
      </span>
      <button
        type="button"
        onClick={() => setShowMenu((s) => !s)}
        data-testid="wallet-menu-trigger"
        className="group inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-panel-2 px-2.5 transition-colors hover:border-border-hi"
      >
        <WalletLogo kind={w.kind} size={16} className="shrink-0 align-middle" />
        <span data-testid="wallet-address-short" data-wallet-name={w.name ?? ''} className="inline-flex items-center">
          <AddressDisplay
            address={w.address}
            ethAddress={w.ethAddress}
            size={14}
            copyable={false}
            className="text-ink"
          />
        </span>
        <svg
          className={`h-3 w-3 shrink-0 text-muted transition-transform group-hover:text-ink ${showMenu ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {showMenu && (
        <div
          data-testid="wallet-menu-connected"
          className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-panel-2 p-1.5 shadow-lift"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
            {kindLabel}
          </div>
          <button
            type="button"
            onClick={copy}
            data-testid="copy-address"
            className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:bg-border"
          >
            <span>Copy address</span>
            {copied && <span className="text-xs text-yes">Copied</span>}
          </button>
          <Link
            href="/portfolio"
            onClick={() => setShowMenu(false)}
            className="block rounded px-2.5 py-1.5 text-sm text-ink transition-colors hover:bg-border"
          >
            Portfolio
          </Link>
          <Link
            href="/explorer"
            onClick={() => setShowMenu(false)}
            className="block rounded px-2.5 py-1.5 text-sm text-ink transition-colors hover:bg-border"
          >
            Explorer
          </Link>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              w.disconnect();
            }}
            data-testid="disconnect"
            className="block w-full rounded px-2.5 py-1.5 text-left text-sm text-no transition-colors hover:bg-no/10"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function WalletRow({
  kind,
  label,
  disabled,
  onClick,
  testid,
}: {
  kind: 'keplr' | 'metamask';
  label: string;
  disabled?: boolean;
  onClick: () => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-border disabled:cursor-not-allowed disabled:opacity-50"
    >
      <WalletLogo kind={kind} size={20} />
      <span className="font-medium">{label}</span>
    </button>
  );
}
