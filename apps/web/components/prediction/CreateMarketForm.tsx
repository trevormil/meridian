'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { TxButton } from '@/components/tx/TxButton';
import { buildPredictionMarket } from '@/lib/prediction-market/sdk';
import { env } from '@/lib/env';
import { useToast } from '@/components/ui/Toasts';

export function CreateMarketForm({ onSuccess }: { onSuccess?: () => void }) {
  const { address } = useWallet();
  const [verifier, setVerifier] = useState('');
  const [verifierTouched, setVerifierTouched] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  /**
   * Read the selected file as a base64 data URL, POST it to the aggregator's
   * upload endpoint, and set the returned URL as the market's image field.
   * Size + MIME validation are handled server-side; we only surface failures.
   */
  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.show({ kind: 'error', title: 'Not an image', detail: file.type });
      return;
    }
    if (file.size > 1_500_000) {
      toast.show({ kind: 'error', title: 'Too large', detail: `${(file.size / 1024).toFixed(0)} KB · max 1500 KB` });
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(r.error ?? new Error('read failed'));
        r.readAsDataURL(file);
      });
      const r = await fetch(`${env.aggregatorUrl}/api/v0/uploads`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataUrl, address }),
      });
      // Defensive parse — when the aggregator route is missing (e.g., dev
      // process hasn't restarted to pick up a new route), Hono returns
      // "404 Not Found" plaintext, which would otherwise crash JSON.parse.
      const text = await r.text();
      let j: { ok?: boolean; url?: string; error?: string } = {};
      try {
        j = text ? (JSON.parse(text) as typeof j) : {};
      } catch {
        toast.show({
          kind: 'error',
          title: `HTTP ${r.status}`,
          detail: text.slice(0, 100) || 'no response body — is the aggregator running with the latest routes?',
        });
        return;
      }
      if (!r.ok || !j.ok || !j.url) {
        toast.show({ kind: 'error', title: 'Upload failed', detail: j.error ?? `HTTP ${r.status}` });
        return;
      }
      setImage(j.url);
    } catch (e) {
      toast.show({ kind: 'error', title: 'Upload error', detail: (e as Error).message });
    } finally {
      setUploading(false);
    }
  }

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
        <Field label="Image (optional)">
          <div className="flex items-stretch gap-3">
            {/* Bigger square preview, top-aligned + matched to the controls'
                full height so it reads as a proper image well (not a tiny
                centered chip). Clay-soft corners + recessed inset. */}
            <div className="flex aspect-square w-24 shrink-0 items-center justify-center overflow-hidden rounded-clay-sm bg-bg-deep shadow-clay-inset">
              {image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={image}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                />
              ) : (
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">no img</span>
              )}
            </div>
            <div className="flex flex-1 flex-col justify-between gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="rounded-full bg-panel-2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-gold shadow-clay-sm transition-all hover:text-gold-bright active:translate-y-0.5 active:shadow-clay-pressed disabled:opacity-50"
                >
                  {uploading ? 'Uploading…' : image ? 'Replace' : 'Upload image'}
                </button>
                {image && (
                  <button
                    type="button"
                    onClick={() => setImage('')}
                    className="rounded-full bg-panel-2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted shadow-clay-sm transition-all hover:text-no-bright active:translate-y-0.5 active:shadow-clay-pressed"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="…or paste an image URL"
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                // Reset so the same file can be re-selected after a clear.
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
          </div>
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
