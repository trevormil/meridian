/**
 * Shared parser for Meridian market names + descriptions.
 *
 * On-chain name format: "TICKER ≥ $STRIKE" (optionally "[LABEL] " prefixed for
 * test markets). The settlement rule is "close AT OR ABOVE strike → YES"
 * (evening.ts uses `closingPrice >= strike`), so the canonical operator is ≥.
 *
 * Markets created before the ≥ fix have ">" baked into their on-chain name;
 * the regex matches both `>` and `≥` so they still parse, and callers render
 * `≥` regardless — the display always reflects the true settlement semantics.
 *
 * The close date lives in the description ("…on YYYY-MM-DD?"). We parse it out
 * so cards can show which trading day a market settles on.
 */
export interface ParsedMarket {
  ticker: string;
  strike: string;
  /** YYYY-MM-DD if present in the description, else null. */
  closeDate: string | null;
}

const NAME_RE = /^([A-Z]{1,6})\s*[>≥]=?\s*\$([0-9,]+)/;

export function parseMarketName(
  name: string | null | undefined,
  description?: string | null,
): ParsedMarket | null {
  if (!name) return null;
  const stripped = name.replace(/^\[[^\]]+]\s*/, '');
  const m = stripped.match(NAME_RE);
  if (!m) return null;
  const closeDate = description?.match(/\bon (\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  return { ticker: m[1], strike: m[2], closeDate };
}

/** "2026-05-22" → "May 22". Returns "" for null/invalid input. */
export function formatCloseDate(closeDate: string | null | undefined): string {
  if (!closeDate || !/^\d{4}-\d{2}-\d{2}$/.test(closeDate)) return '';
  // Parse as a date-only value at noon ET so the calendar day doesn't slip.
  const d = new Date(`${closeDate}T12:00:00-04:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}
