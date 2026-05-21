import { Hono } from 'hono';
import { getDb } from '../db/index.js';

/**
 * Image uploads — backs the "Create market" image picker on the FE. The FE
 * sends a base64 image; we materialize it into the `uploads` table and
 * return a URL the FE can drop into the market's `image` field on chain.
 *
 *   POST /api/v0/uploads   { dataUrl, address? }  →  { url, id, size }
 *   GET  /api/v0/uploads/:id                       →  binary, correct MIME
 *
 * Size cap: 1.5MB encoded (which is ~1MB raw). Reject anything bigger so the
 * SQLite row stays small and the chain metadata's link-only model isn't
 * abused for video-sized payloads.
 */

const MAX_ENCODED_BYTES = 1.5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export const uploads = new Hono();

uploads.post('/uploads', async (c) => {
  let body: { dataUrl?: string; address?: string };
  try {
    body = (await c.req.json()) as { dataUrl?: string; address?: string };
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  if (!body.dataUrl || typeof body.dataUrl !== 'string') {
    return c.json({ error: 'missing_dataUrl' }, 400);
  }
  const m = body.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return c.json({ error: 'bad_data_url' }, 400);
  const mime = m[1];
  const b64 = m[2];
  if (!ALLOWED_MIME.has(mime)) {
    return c.json({ error: 'unsupported_mime', mime }, 415);
  }
  if (b64.length > MAX_ENCODED_BYTES) {
    return c.json({ error: 'too_large', maxBytes: MAX_ENCODED_BYTES }, 413);
  }
  // Decode without throwing — bun:sqlite needs a real Buffer or Uint8Array.
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, 'base64');
  } catch {
    return c.json({ error: 'decode_failed' }, 400);
  }
  const id =
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  getDb()
    .prepare(
      'INSERT INTO uploads (id, mime, bytes, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(id, mime, bytes, bytes.byteLength, Date.now(), body.address ?? null);

  // Absolute URL so the chain metadata's image field is portable — FE can be
  // served from anywhere and still resolve the asset.
  const origin = new URL(c.req.url).origin;
  return c.json({
    ok: true,
    id,
    url: `${origin}/api/v0/uploads/${id}`,
    size: bytes.byteLength,
    mime,
  });
});

uploads.get('/uploads/:id', (c) => {
  const id = c.req.param('id');
  const row = getDb()
    .prepare('SELECT mime, bytes, size FROM uploads WHERE id = ?')
    .get(id) as { mime: string; bytes: Buffer; size: number } | undefined;
  if (!row) return c.json({ error: 'not_found' }, 404);
  return new Response(new Uint8Array(row.bytes), {
    status: 200,
    headers: {
      'content-type': row.mime,
      'content-length': String(row.size),
      // Cache aggressively — uploads are immutable (PK = generated id).
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
});
