'use client';

import { useRouter } from 'next/navigation';
import { CreateMarketForm } from '@/components/prediction/CreateMarketForm';
import { aggregator } from '@/lib/aggregator';

export default function CreatePage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-gold-gradient mb-2 font-display text-3xl font-bold leading-[1.05] tracking-marquee">
        Create a prediction market
      </h1>
      <p className="mb-6 text-sm text-muted">
        Markets are binary YES/NO. They settle via a designated verifier who casts an on-chain vote when the outcome is
        known.
      </p>
      <CreateMarketForm
        onSuccess={async () => {
          // Give the chain a moment to commit, then trigger an indexer refresh
          // so the new market shows up on browse immediately.
          await new Promise((r) => setTimeout(r, 2000));
          try {
            await aggregator.refresh();
          } catch {
            // refresh failure is non-fatal; periodic loop will catch it
          }
          router.push('/markets');
        }}
      />
    </div>
  );
}
