'use client';

import { useState } from 'react';
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

  return (
    <div className="flex h-8 items-center gap-2" data-testid="wallet-connected">
      {/* Hidden testid carrying the persona name. Used by the Playwright suite
          to assert "connected as e2e-alice" without exposing the persona label
          in the visible pill (the user-facing UI only shows the address). */}
      <span className="sr-only" data-testid="wallet-name">
        {w.name ?? ''}
      </span>
      <button
        type="button"
        onClick={copy}
        title={`Click to copy ${w.ethAddress ?? w.address}`}
        data-testid="copy-address"
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
        <span
          className={`inline-flex w-3.5 items-center justify-center ${copied ? 'text-yes' : 'text-muted group-hover:text-ink'}`}
          aria-live="polite"
        >
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
          )}
        </span>
      </button>
      {/* Disconnect is hidden on mobile to keep the header from overflowing —
          tap the address pill to copy; full disconnect lives on ≥ sm. */}
      <Button
        variant="ghost"
        size="sm"
        onClick={w.disconnect}
        data-testid="disconnect"
        className="hidden sm:inline-flex"
      >
        Disconnect
      </Button>
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
