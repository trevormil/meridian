/**
 * Failure alerting for the Meridian daily lifecycle scripts.
 *
 * Channel-agnostic and dependency-free (native Bun `fetch`, no axios). Selection
 * order: Telegram (if bot token + chat id set) → generic webhook → console. The
 * generic webhook is the documented default; point it at a Slack/Discord
 * incoming webhook or any endpoint you like.
 *
 * `sendAlert` NEVER throws — a down alert channel must not crash a settle/morning
 * run. Env is read via `process.env` directly because the `env.ts` `req()`
 * helper throws on missing keys and these are all optional.
 */

export interface AlertTransport {
  name: 'telegram' | 'webhook' | 'console';
  send(title: string, body: string): Promise<void>;
}

type Env = Record<string, string | undefined>;

/** Pure transport selection — pass an env object to test without mutating process.env. */
export function resolveTransport(env: Env = process.env): AlertTransport {
  const tgToken = env.MERIDIAN_ALERT_TELEGRAM_BOT_TOKEN;
  const tgChat = env.MERIDIAN_ALERT_TELEGRAM_CHAT_ID;
  if (tgToken && tgChat) {
    return {
      name: 'telegram',
      async send(title, body) {
        const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: tgChat, text: `*${title}*\n${body}`, parse_mode: 'Markdown' }),
        });
        if (!r.ok) throw new Error(`telegram HTTP ${r.status}`);
      },
    };
  }

  const webhook = env.MERIDIAN_ALERT_WEBHOOK_URL;
  if (webhook) {
    return {
      name: 'webhook',
      async send(title, body) {
        const r = await fetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title, body, ts: new Date().toISOString() }),
        });
        if (!r.ok) throw new Error(`webhook HTTP ${r.status}`);
      },
    };
  }

  return {
    name: 'console',
    async send(title, body) {
      console.error(`[ALERT] ${title}\n${body}`);
    },
  };
}

/** Best-effort alert. Resolves even if the transport fails (falls back to console). */
export async function sendAlert(title: string, body: string): Promise<void> {
  const transport = resolveTransport();
  try {
    await transport.send(title, body);
  } catch (e) {
    console.error(`[ALERT][transport-failed:${transport.name}] ${(e as Error).message}\n${title}\n${body}`);
  }
}
