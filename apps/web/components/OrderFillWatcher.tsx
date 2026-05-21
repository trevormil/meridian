'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useRealtime } from '@/lib/useRealtime';
import { ch } from '@/lib/realtime';
import { useToast } from '@/components/ui/Toasts';
import { type IntentDto } from '@/lib/aggregator';
import { env } from '@/lib/env';

/**
 * Detects when one of the connected user's intents transitions from active to
 * "used" (filled or cancelled) and fires a toast. Mounted at layout-level so
 * notifications fire regardless of which page the user is on.
 *
 * Distinguishes filled-by-counterparty (good news) from user-cancelled (no toast)
 * by tracking which intents the user actively cancelled in this session via a
 * separate event in the future; for now we toast any flip, with copy that
 * works either way ("Order filled or cancelled — check Portfolio").
 *
 * The realtime `intents-owner:{addr}` channel already pushes the full set on
 * every change, so we just diff snapshots.
 */
export function OrderFillWatcher() {
  const { address } = useWallet();
  const toast = useToast();
  const intents = useRealtime<IntentDto[]>(address ? ch.intentsOwner(address) : null);
  // Track the previous active set so we can diff on each push. Keyed by the
  // (level, approvalId) tuple which uniquely identifies an intent.
  const prevActive = useRef<Map<string, IntentDto>>(new Map());
  // Prevent the first snapshot (load existing intents) from spamming toasts —
  // we only want to react to TRANSITIONS that happen after the first paint.
  const seeded = useRef(false);

  useEffect(() => {
    if (!intents) return;
    const currentActive = new Map<string, IntentDto>();
    for (const i of intents) {
      if (i.isActive) currentActive.set(keyOf(i), i);
    }

    if (!seeded.current) {
      prevActive.current = currentActive;
      seeded.current = true;
      return;
    }

    // Anything that WAS active and is no longer in the active set has been
    // filled, cancelled, or expired. Surface as a notification.
    for (const [key, prev] of prevActive.current) {
      if (!currentActive.has(key)) {
        const tokenAmount = prev.payDenom?.startsWith('badgeslp:')
          ? prev.payAmount
          : prev.receiveAmount;
        const usdcAmount = prev.payDenom?.startsWith('badgeslp:')
          ? prev.receiveAmount
          : prev.payAmount;
        const side = inferSide(prev);
        const direction = prev.approvalLevel === 'incoming' ? 'Buy' : 'Sell';
        const tokens = formatBase(tokenAmount, env.usdcDecimals);
        const usdc = formatBase(usdcAmount, env.usdcDecimals);
        toast.show({
          kind: 'success',
          title: `${direction} ${side} order matched`,
          detail: `${tokens} ${side} for ${usdc} ${env.usdcSymbol} on market #${prev.collectionId}`,
          ttl: 6000,
        });
      }
    }

    prevActive.current = currentActive;
  }, [intents, toast]);

  // Reset diff state when the connected address changes (different user's
  // intents shouldn't fire fake notifications under the new address).
  useEffect(() => {
    seeded.current = false;
    prevActive.current = new Map();
  }, [address]);

  return null;
}

function keyOf(i: IntentDto): string {
  return `${i.approvalLevel}:${i.approvalId}`;
}

function inferSide(i: IntentDto): 'YES' | 'NO' | 'unknown' {
  const denom = i.payDenom?.startsWith('badgeslp:') ? i.payDenom : i.receiveDenom;
  if (denom?.endsWith(':uyes')) return 'YES';
  if (denom?.endsWith(':uno')) return 'NO';
  return 'unknown';
}

function formatBase(raw: string | null | undefined, decimals: number): string {
  if (!raw) return '0';
  const big = BigInt(raw);
  if (decimals === 0) return big.toString();
  const div = BigInt(10) ** BigInt(decimals);
  const whole = big / div;
  const frac = big % div;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}
