'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { TxButton } from '@/components/tx/TxButton';
import { buildPredictionMarket } from '@/lib/prediction-market/sdk';
import { env } from '@/lib/env';

export function CreateMarketForm({ onSuccess }: { onSuccess?: () => void }) {
  const { address } = useWallet();
  const [verifier, setVerifier] = useState('');
  const [verifierTouched, setVerifierTouched] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');

  // Default verifier to the connected wallet so creators can self-resolve
  // by default. Only auto-populate while the user hasn't manually edited it
  // — once they type, we leave their value alone even if they reconnect.
  useEffect(() => {
    if (address && !verifierTouched && !verifier) setVerifier(address);
  }, [address, verifierTouched, verifier]);

  const valid = !!address && verifier.startsWith('bb1') && name.length > 0;

  return (
    <Card variant="hero" className="bg-hero-radial">
      <CardHeader>
        <CardTitle>New prediction market</CardTitle>
        <span className="flex items-center gap-1.5 rounded-full border border-border bg-panel-2 px-2 py-0.5 text-xs">
          <CoinIcon denom={env.usdcDenom} size="xs" /> Backed by {env.usdcSymbol}
        </span>
      </CardHeader>

      <div className="space-y-4">
        <Field label="Question">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Will X happen by Y?" />
        </Field>
        <Field label="Resolution criteria">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What sources or events determine the outcome?"
            rows={3}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </Field>
        <Field label="Image URL (optional)">
          <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
        </Field>
        <Field
          label="Verifier address"
          hint={
            address && verifier === address
              ? 'Defaulted to your connected wallet — you can resolve this market yourself.'
              : "Settles the market by casting an on-chain vote. Use your own address if you'll resolve it."
          }
        >
          <div className="flex gap-2">
            <Input
              value={verifier}
              onChange={(e) => {
                setVerifier(e.target.value);
                setVerifierTouched(true);
              }}
              placeholder="bb1…"
              className="font-mono"
            />
            {address && verifier !== address && (
              <button
                type="button"
                onClick={() => {
                  setVerifier(address);
                  setVerifierTouched(true);
                }}
                className="shrink-0 rounded-lg border border-border bg-panel-2 px-3 text-xs font-semibold text-muted hover:border-accent hover:text-accent"
              >
                Use me
              </button>
            )}
          </div>
        </Field>

        <div className="rounded-lg border border-border bg-bg/40 p-3 text-xs text-muted">
          <p>Creates a new collection with 7 frozen approvals: paired-mint, pre-settlement redeem, transferable, and 4 settlement paths (YES/NO/push-YES/push-NO).</p>
        </div>

        <TxButton
          label="Deploy market"
          disabled={!valid}
          build={() => {
            if (!address) return [];
            const msg = buildPredictionMarket({ verifier, name, description, image }) as {
              typeUrl: string;
              value: Record<string, unknown>;
            };
            msg.value.creator = address;
            return [msg];
          }}
          onSuccess={onSuccess}
        />
      </div>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <p className="mt-1 text-xs text-muted/80">{hint}</p>}
    </label>
  );
}
