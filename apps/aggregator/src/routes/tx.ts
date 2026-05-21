import { Hono } from 'hono';
import { env } from '../env.js';

export const tx = new Hono();

/**
 * The SDK's BitBadgesSigningClient posts a body shaped as
 *   { tx_bytes: number[], mode: string }
 * to apiUrl + /api/v0/{simulate,broadcast}. We accept that shape, re-encode
 * tx_bytes as base64, and forward to LCD's cosmos/tx endpoints. Responses are
 * returned verbatim — they already match the Cosmos REST shape that the SDK
 * expects ({ gas_info, result } for simulate, { tx_response } for broadcast).
 */
async function forward(path: string, body: { tx_bytes: number[] | string; mode?: string }) {
  const bytes = Array.isArray(body.tx_bytes)
    ? Buffer.from(Uint8Array.from(body.tx_bytes)).toString('base64')
    : body.tx_bytes;
  const payload: Record<string, unknown> = { tx_bytes: bytes };
  if (body.mode) payload.mode = body.mode;
  const r = await fetch(`${env.lcdUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  return { status: r.status, data };
}

tx.post('/simulate', async (c) => {
  const body = await c.req.json();
  const { status, data } = await forward('/cosmos/tx/v1beta1/simulate', body);
  return c.json(data, status as any);
});

tx.post('/broadcast', async (c) => {
  const body = await c.req.json();
  const { status, data } = await forward('/cosmos/tx/v1beta1/txs', body);
  return c.json(data, status as any);
});
