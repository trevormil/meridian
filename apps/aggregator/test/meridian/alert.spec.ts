/**
 * Unit tests for the alert helper. Pure transport selection + the never-throws
 * guarantee. No real network.
 *
 *   bun test test/meridian/alert.spec.ts
 */
import { test, expect, afterEach } from 'bun:test';
import { resolveTransport, sendAlert } from '../../src/meridian/alert.js';

test('resolveTransport picks Telegram when both bot token + chat id are set', () => {
  const t = resolveTransport({
    MERIDIAN_ALERT_TELEGRAM_BOT_TOKEN: 'tok',
    MERIDIAN_ALERT_TELEGRAM_CHAT_ID: '123',
    MERIDIAN_ALERT_WEBHOOK_URL: 'https://example.com/hook',
  });
  expect(t.name).toBe('telegram');
});

test('resolveTransport falls back to webhook when Telegram is incomplete', () => {
  expect(resolveTransport({ MERIDIAN_ALERT_WEBHOOK_URL: 'https://example.com/hook' }).name).toBe('webhook');
  // Only the bot token, no chat id → not Telegram.
  expect(
    resolveTransport({ MERIDIAN_ALERT_TELEGRAM_BOT_TOKEN: 'tok', MERIDIAN_ALERT_WEBHOOK_URL: 'https://example.com/hook' }).name,
  ).toBe('webhook');
});

test('resolveTransport defaults to console when nothing is configured', () => {
  expect(resolveTransport({}).name).toBe('console');
});

const origFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = origFetch;
  delete process.env.MERIDIAN_ALERT_WEBHOOK_URL;
  delete process.env.MERIDIAN_ALERT_TELEGRAM_BOT_TOKEN;
  delete process.env.MERIDIAN_ALERT_TELEGRAM_CHAT_ID;
});

test('sendAlert never throws when the transport fails', async () => {
  process.env.MERIDIAN_ALERT_WEBHOOK_URL = 'https://example.com/hook';
  // Stub fetch to reject — sendAlert must swallow and fall back to console.
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  await expect(sendAlert('title', 'body')).resolves.toBeUndefined();
});

test('sendAlert never throws on the console path either', async () => {
  // No env configured → console transport, which cannot throw.
  await expect(sendAlert('title', 'body')).resolves.toBeUndefined();
});
