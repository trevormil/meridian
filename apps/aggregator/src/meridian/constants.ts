/**
 * Meridian project constants. Per the spec:
 *   - 7 MAG7 stocks
 *   - Strikes at ±3%, ±6%, ±9% from previous close, rounded to nearest $10
 *   - Plus the rounded previous close itself as an at-the-money strike (7th)
 *   - Deduplicated; low-priced stocks like AAPL collapse to ~5 unique strikes
 */

export const MAG7 = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'] as const;
export type Ticker = (typeof MAG7)[number];

/** Strike percentage offsets from the previous close. Includes 0% (at-the-money). */
export const STRIKE_OFFSETS = [-0.09, -0.06, -0.03, 0, 0.03, 0.06, 0.09] as const;

/** Rounding granularity (in USD) — spec says nearest $10. */
export const STRIKE_ROUND_TO = 10;

/** Token quantity each market mint represents — base units (6-decimal USDC). */
export const ONE_TOKEN = 1_000_000n;

/**
 * Base URL for per-ticker logos. Defaults to a public GitHub mirror of all
 * MAG7 logos that's been stable for years; production deployments can override
 * via `MERIDIAN_LOGO_BASE` to point at their own CDN.
 *
 * Local mirrors of these PNGs ship in `apps/web/public/companies/{TICKER}.png`
 * for the FE to render offline if needed.
 */
export const LOGO_BASE =
  process.env.MERIDIAN_LOGO_BASE ??
  'https://raw.githubusercontent.com/davidepalazzo/ticker-logos/master/ticker_icons';

export function logoUrl(ticker: Ticker): string {
  return `${LOGO_BASE}/${ticker}.png`;
}
