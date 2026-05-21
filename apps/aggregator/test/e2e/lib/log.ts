/* eslint-disable no-console */

const RESET = '\x1b[0m';
const colors = {
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
} as const;

function paint(c: keyof typeof colors, s: string): string {
  return `${colors[c]}${s}${RESET}`;
}

export const log = {
  info: (msg: string) => console.log(paint('dim', '·'), msg),
  step: (msg: string) => console.log(paint('cyan', '→'), paint('bold', msg)),
  ok: (msg: string) => console.log(paint('green', '✓'), msg),
  warn: (msg: string) => console.log(paint('yellow', '!'), msg),
  fail: (msg: string) => console.log(paint('red', '✗'), paint('red', msg)),
  scenario: (msg: string) => console.log('\n' + paint('magenta', '◆'), paint('bold', msg)),
  raw: (s: string) => console.log(paint('dim', s)),
};

export class AssertionError extends Error {
  constructor(public readonly hint: string, public readonly expected: unknown, public readonly actual: unknown) {
    super(`${hint}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

function jsonify(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(jsonify);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = jsonify(val);
    return o;
  }
  return v;
}

export function assertEq<T>(hint: string, actual: T, expected: T): void {
  const a = JSON.stringify(jsonify(actual));
  const e = JSON.stringify(jsonify(expected));
  if (a !== e) {
    log.fail(`${hint}: expected ${e} got ${a}`);
    throw new AssertionError(hint, expected, actual);
  }
  log.ok(`${hint} = ${a}`);
}

export function assertClose(hint: string, actual: number, expected: number, tol = 0.01): void {
  if (Math.abs(actual - expected) > tol) {
    log.fail(`${hint}: expected ≈${expected} got ${actual} (tol=${tol})`);
    throw new AssertionError(hint, expected, actual);
  }
  log.ok(`${hint} ≈ ${actual.toFixed(4)} (target ${expected})`);
}

export function assertTrue(hint: string, cond: boolean): void {
  if (!cond) {
    log.fail(`${hint}: condition false`);
    throw new AssertionError(hint, true, false);
  }
  log.ok(hint);
}
