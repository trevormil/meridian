import { env } from './env';

export function fromMicroUsdc(amount: string | number | bigint | null | undefined): string {
  if (amount === null || amount === undefined) return '0';
  const big = BigInt(amount);
  const div = BigInt(10) ** BigInt(env.usdcDecimals);
  const whole = big / div;
  const frac = big % div;
  const fracStr = frac.toString().padStart(env.usdcDecimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

export function toMicroUsdc(amount: string): bigint {
  const [whole, frac = ''] = amount.split('.');
  const padded = (frac + '0'.repeat(env.usdcDecimals)).slice(0, env.usdcDecimals);
  return BigInt(whole || '0') * BigInt(10) ** BigInt(env.usdcDecimals) + BigInt(padded || '0');
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function shortAddr(a: string | null | undefined): string {
  if (!a) return '—';
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
}
