/**
 * EVM-signed scenarios. Exercises the precompile path:
 *   - Sign with GenericEvmAdapter.fromMnemonic (same wallet as Keplr's, just
 *     a different signer abstraction)
 *   - Chain wraps as MsgEthereumTx whose body calls the BitBadges precompile
 *   - All chain-side accounting (events, balances, intents, votes) stays in
 *     the bb1 form — the 0x address is purely user-facing
 *
 * The aggregator's tx-watcher consumes the SAME `usedApprovalDetails` /
 * `message.msg_type=cast_vote` events regardless of envelope, so these tests
 * are also a sanity check that our parsing didn't accidentally key off
 * `message.action`.
 */
import { GenericEvmAdapter, BitBadgesSigningClient, encodeMsgsFromJson, convertToBitBadgesAddress } from 'bitbadges';
import { config } from '../lib/config.js';
import { log, assertEq, assertTrue } from '../lib/log.js';
import { sleep } from '../lib/wait.js';
import { loadPersonas } from '../lib/personas.js';
import { getYesNoBalance } from '../lib/queries.js';
import { buildPredictionMarketDepositMsg } from 'bitbadges';
import { bootstrapMarket } from './index.js';
import type { Scenario, Ctx } from './index.js';

const blockTimeMs = 1500;

async function getUsdc(addr: string): Promise<bigint> {
  const r = await fetch(
    `${config.lcdUrl}/cosmos/bank/v1beta1/balances/${addr}/by_denom?denom=${encodeURIComponent(config.usdcDenom)}`,
  );
  if (!r.ok) return 0n;
  const j = (await r.json()) as { balance?: { amount?: string } };
  return BigInt(j.balance?.amount ?? '0');
}

interface EvmSigner {
  bbAddress: string;
  ethAddress: string;
  client: BitBadgesSigningClient;
}

async function makeEvmSigner(mnemonic: string): Promise<EvmSigner> {
  const adapter = await GenericEvmAdapter.fromMnemonic(mnemonic, 'http://localhost:8545', {
    expectedChainId: 90123,
  });
  // `address` is a public readonly property on GenericEvmAdapter — not a method.
  const ethAddress = adapter.address;
  const bbAddress = convertToBitBadgesAddress(ethAddress);
  const client = new BitBadgesSigningClient({
    adapter,
    network: 'local',
    apiUrl: config.aggregatorUrl,
    nodeUrl: config.aggregatorUrl,
    cosmosChainId: config.chainId,
    evmChainId: 90123,
    evmRpcUrl: 'http://localhost:8545',
  });
  return { bbAddress, ethAddress, client };
}

async function evmBroadcast(signer: EvmSigner, envelopes: unknown[]): Promise<string> {
  const messages = encodeMsgsFromJson(envelopes as any[]);
  const r = await signer.client.signAndBroadcast(messages as any);
  if (!r.success) throw new Error(`evm broadcast failed: ${r.error ?? `code ${r.code}`}`);
  return r.txHash;
}

async function evmRpcAvailable(): Promise<boolean> {
  try {
    const r = await fetch('http://localhost:8545', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export const evmScenarios: Scenario[] = [
  {
    name: 'EVM signer: deposit via MsgEthereumTx mints YES+NO',
    async run({ alice }: Ctx) {
      // The local chain has Ethermint JSON-RPC disabled by default — without
      // it, the precompile signing path can't broadcast. Soft-skip when the
      // RPC isn't reachable so this test runs only on chains with json-rpc on.
      if (!(await evmRpcAvailable())) {
        log.step('skip: EVM JSON-RPC not reachable at localhost:8545 (enable in app.toml `[json-rpc]` to run)');
        return;
      }

      // Build an EVM signer for bob. NOTE: the GenericCosmosAdapter uses
      // the classic Cosmos pubkey-hash derivation (ripemd160(sha256(pubkey)))
      // while the EVM adapter derives the address via Ethermint's keccak path
      // (bb1 = bech32(keccak256(pubkey)[12:])). So the SAME mnemonic gives
      // DIFFERENT bb1 addresses through the two adapters — chain accepts
      // both, and any deposit/transfer is keyed by whichever bb1 the signing
      // pubkey resolves to via that path.
      const { bob: bobPersona } = loadPersonas();
      log.step('build EVM signer for bob (same mnemonic, Ethermint keccak derivation)');
      const evmBob = await makeEvmSigner(bobPersona.mnemonic);
      log.ok(`bob via EVM: 0x${evmBob.ethAddress.slice(2, 10)}… → ${evmBob.bbAddress.slice(0, 12)}…`);

      // The EVM-derived bb1 isn't seeded at genesis (only the Cosmos-derived
      // one is). Fund it from the aggregator's dev faucet so the deposit has
      // USDC to spend. The faucet sends 10 USDC per claim; we claim once to
      // cover the 5 USDC deposit + fees.
      const balance0 = await getUsdc(evmBob.bbAddress);
      if (balance0 < 5_000_000n) {
        log.step(`fund EVM bb1 via faucet (current bal=${balance0})`);
        const r = await fetch(`${config.aggregatorUrl}/api/v0/faucet/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address: evmBob.bbAddress }),
        });
        if (!r.ok) {
          log.step(`skip: faucet unavailable (${r.status}) — restart chain with PR #99 seed`);
          return;
        }
        await sleep(blockTimeMs * 2);
        const balance1 = await getUsdc(evmBob.bbAddress);
        if (balance1 < 5_000_000n) {
          log.step(`skip: faucet did not fund EVM bb1 (now=${balance1})`);
          return;
        }
        log.ok(`EVM bb1 funded → ${balance1} uUSDC`);
      }
      log.step('alice creates a market (Cosmos signing)');
      const { collectionId, approvals } = await bootstrapMarket(alice, `e2e-evm-${Date.now()}`);
      const before = await getYesNoBalance(collectionId, evmBob.bbAddress);

      log.step('bob deposits 5M USDC via MsgEthereumTx wrapping the precompile');

      const envelope = buildPredictionMarketDepositMsg(
        evmBob.bbAddress,
        collectionId,
        5_000_000n,
        approvals.mintApprovalId!,
      );
      const txHash = await evmBroadcast(evmBob, [envelope]);
      log.ok(`evm deposit tx ${txHash.slice(0, 12)}…`);
      await sleep(blockTimeMs * 3);

      const after = await getYesNoBalance(collectionId, evmBob.bbAddress);
      // Chain accounting is in bb1 — balances increase against the bb1 form
      // even though the signer authed via EVM.
      assertEq('YES +5M (bb1-keyed)', after.yes, before.yes + 5_000_000n);
      assertEq('NO +5M  (bb1-keyed)', after.no, before.no + 5_000_000n);
    },
  },
];
