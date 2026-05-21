/**
 * WebSocket streaming scenarios. Verify that:
 *   - subscribing immediately yields a snapshot (no separate REST call needed)
 *   - state-changing chain actions trigger pushes on the right channels
 *
 * Each WS subscription is set up BEFORE the trigger action so we can verify
 * the push lands, not just the snapshot.
 */
import { config } from '../lib/config.js';
import { log, assertEq, assertTrue } from '../lib/log.js';
import { sleep } from '../lib/wait.js';
import { deposit, postIntent, fillIntent } from '../lib/txs.js';
import { bootstrapMarket } from './index.js';
import type { Scenario } from './index.js';

const blockTimeMs = 1500;

/** Tiny WS helper — connect, subscribe, collect every message on a channel. */
function watchChannel(channel: string, timeoutMs = 10_000): {
  promise: Promise<unknown[]>;
  close: () => void;
} {
  const url = config.aggregatorUrl.replace(/^http/, 'ws') + '/ws';
  const ws = new WebSocket(url);
  const messages: unknown[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolveFn: ((v: unknown[]) => void) | null = null;

  const promise = new Promise<unknown[]>((res) => {
    resolveFn = res;
    timer = setTimeout(() => res(messages), timeoutMs);
  });

  ws.onopen = () => ws.send(JSON.stringify({ action: 'subscribe', channel }));
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data as string);
      if (msg.channel === channel) messages.push(msg.data);
    } catch {
      // ignore malformed
    }
  };

  return {
    promise,
    close: () => {
      if (timer) clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolveFn?.(messages);
    },
  };
}

export const realtimeScenarios: Scenario[] = [
  {
    name: 'WS: subscribe to market sends snapshot + push on deposit',
    async run({ alice, bob }) {
      const { collectionId, approvals } = await bootstrapMarket(alice, `e2e-ws-${Date.now()}`);

      log.step(`open WS subscription to market:${collectionId}`);
      const watcher = watchChannel(`market:${collectionId}`, 12_000);
      await sleep(500); // let WS open + initial snapshot land

      log.step('bob deposits → triggers usedApprovalDetails → fires market: push');
      await deposit(bob, collectionId, 5_000_000n, approvals.mintApprovalId!);
      await sleep(blockTimeMs * 3);

      watcher.close();
      const messages = await watcher.promise;

      // Snapshot is message[0]; pushes follow.
      assertTrue(`got ≥1 message (snapshot at minimum)`, messages.length >= 1);
      const snapshot = messages[0] as any;
      assertEq('snapshot is the right market', snapshot.collectionId, collectionId);

      const finalMsg = messages[messages.length - 1] as any;
      assertTrue(
        `final state reflects deposit (got total_deposited=${finalMsg.totalDeposited})`,
        BigInt(finalMsg.totalDeposited ?? '0') >= 4_900_000n,
      );
    },
  },

  {
    name: 'WS: candle channel pushes on fill',
    async run({ alice, bob }) {
      const { collectionId, approvals } = await bootstrapMarket(alice, `e2e-ws-candle-${Date.now()}`);
      await deposit(bob, collectionId, 2_000_000n, approvals.mintApprovalId!);
      await sleep(blockTimeMs);

      log.step(`open WS subscription to candle:${collectionId}`);
      const watcher = watchChannel(`candle:${collectionId}`, 12_000);
      await sleep(500);

      log.step('bob posts SELL YES, alice fills → emits fill candle');
      const { approvalId } = await postIntent(bob, {
        collectionId,
        side: 'yes',
        direction: 'sell',
        tokenAmount: 1_000_000n,
        price: 0.55,
      });
      await sleep(blockTimeMs);
      // SELL = outgoing approval owned by bob; alice fills via that approval,
      // taking tokenId 1 (YES) from bob.
      await fillIntent(alice, {
        collectionId,
        approvalId,
        approvalLevel: 'outgoing',
        ownerAddress: bob.persona.address,
        tokenId: 1,
        tokenAmount: 1_000_000n,
      });
      await sleep(blockTimeMs * 3);

      watcher.close();
      const messages = await watcher.promise;
      assertTrue(`got ≥1 candle message`, messages.length >= 1);
      // Find the most recent non-null candle — the snapshot may be null when
      // no candles exist yet, but the push from the fill must be non-null.
      const pushed = [...messages].reverse().find((m) => m !== null) as any;
      assertTrue(`got a non-null candle`, !!pushed);
      assertTrue(
        `candle yes_price ≈ 0.55 (got ${pushed.yes_price})`,
        Math.abs(pushed.yes_price - 0.55) < 0.02,
      );
    },
  },
];
