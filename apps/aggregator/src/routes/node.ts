import { Hono } from 'hono';
import { env } from '../env.js';

export const node = new Hono();

/**
 * Proxy a curated subset of cosmos REST endpoints to LCD. The SDK signing
 * client hits `${nodeUrl}/cosmos/auth/v1beta1/accounts/{addr}` before every
 * tx; LCD returns HTTP 500 (not 404) for accounts that have never broadcast
 * a tx, which throws past the SDK's "new account" fallback. We wrap those
 * errors and return `{account: null}` instead, restoring the fallback path.
 *
 * Also proxies bank balance queries the web app uses directly, so the FE can
 * point exclusively at the aggregator and we avoid the "two CORS targets"
 * deployment headache.
 */

async function proxyJson(path: string): Promise<{ status: number; body: unknown }> {
  const r = await fetch(`${env.lcdUrl}${path}`, { headers: { accept: 'application/json' } });
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    // empty body
  }
  return { status: r.status, body };
}

node.get('/cosmos/auth/v1beta1/accounts/:address', async (c) => {
  const { status, body } = await proxyJson(`/cosmos/auth/v1beta1/accounts/${c.req.param('address')}`);
  if (status >= 400) {
    return c.json({ account: null }, 200);
  }
  return c.json(body as Record<string, unknown>, status as any);
});

node.get('/cosmos/bank/v1beta1/balances/:address', async (c) => {
  const { status, body } = await proxyJson(`/cosmos/bank/v1beta1/balances/${c.req.param('address')}`);
  if (status >= 400) return c.json({ balances: [] }, 200);
  return c.json(body as Record<string, unknown>, status as any);
});

node.get('/bitbadges/bitbadgeschain/tokenization/get_collection/:id', async (c) => {
  const { status, body } = await proxyJson(`/bitbadges/bitbadgeschain/tokenization/get_collection/${c.req.param('id')}`);
  return c.json(body as Record<string, unknown>, status as any);
});

node.get('/bitbadges/bitbadgeschain/tokenization/get_balance/:collectionId/:address', async (c) => {
  const path = `/bitbadges/bitbadgeschain/tokenization/get_balance/${c.req.param('collectionId')}/${c.req.param('address')}`;
  const { status, body } = await proxyJson(path);
  if (status >= 400) return c.json({ balance: null }, 200);
  return c.json(body as Record<string, unknown>, status as any);
});
