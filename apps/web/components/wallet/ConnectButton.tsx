'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { Button } from '@/components/ui/Button';
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
                  className="rounded px-3 py-1.5 text-left text-sm hover:bg-border"
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="font-mono text-[10px] text-muted">{shortAddr(p.address)}</div>
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
              label="Keplr"
              sub={keplrAvail ? 'Cosmos signing' : 'Not detected'}
              disabled={!keplrAvail}
              onClick={() => {
                setShowMenu(false);
                w.connectKeplr();
              }}
              testid="connect-keplr"
            />
            <WalletRow
              label="MetaMask"
              sub={mmAvail ? 'EVM precompile signing' : 'Not detected'}
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
    try {
      await navigator.clipboard.writeText(w.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // browser blocked clipboard — silently no-op
    }
  }

  return (
    <div className="flex items-center gap-2" data-testid="wallet-connected">
      <button
        type="button"
        onClick={copy}
        title={`Click to copy ${w.address}`}
        data-testid="copy-address"
        className="group flex items-center gap-2 rounded-lg border border-border bg-panel-2 px-2.5 py-1.5 transition-colors hover:border-border-hi"
      >
        <div className="hidden text-right sm:block">
          <div className="text-xs font-medium leading-tight text-ink" data-testid="wallet-name">
            {w.name}
            {w.kind === 'metamask' && <span className="ml-1 text-[9px] uppercase tracking-wider text-muted">EVM</span>}
          </div>
          <div className="font-mono text-[10px] leading-tight text-muted" data-testid="wallet-address-short">
            {shortAddr(w.address)}
          </div>
        </div>
        <span
          className={`text-xs ${copied ? 'text-yes' : 'text-muted group-hover:text-ink'}`}
          aria-live="polite"
        >
          {copied ? '✓' : '📋'}
        </span>
      </button>
      <Button variant="ghost" size="sm" onClick={w.disconnect} data-testid="disconnect">
        Disconnect
      </Button>
    </div>
  );
}

function WalletRow({
  label,
  sub,
  disabled,
  onClick,
  testid,
}: {
  label: string;
  sub: string;
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
      className="flex items-center justify-between rounded px-3 py-1.5 text-left text-sm hover:bg-border disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="font-medium">{label}</span>
      <span className="text-[10px] text-muted">{sub}</span>
    </button>
  );
}
