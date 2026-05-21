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
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-panel-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
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
            className="w-full rounded border border-border bg-bg-deep px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-gold/60 focus:bg-bg-deep focus:outline-none focus:shadow-[0_0_0_4px_rgba(232,177,74,0.10)] transition-colors"
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
                className="shrink-0 rounded border border-border bg-bg-deep px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-gold/40 hover:text-gold-bright"
              >
                Use me
              </button>
            )}
          </div>
        </Field>

        <div className="rounded border border-border bg-bg-deep p-3 text-[11px] leading-relaxed text-faint">
          Creates a new collection with 7 frozen approvals: paired-mint,
          pre-settlement redeem, transferable, and 4 settlement paths
          (YES / NO / push-YES / push-NO).
        </div>

        <TxButton
          fullWidth
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
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{hint}</p>}
    </label>
  );
}
