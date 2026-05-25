import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export const metadata = {
  title: 'How it works · Meridian',
  description:
    'A prediction market on BitBadges is seven on-chain approvals. The token standard, its primitives, and the seven rules that make a market.',
};

/**
 * Visual, low-prose explainer for a crypto-literate, non-technical reader.
 * (1) prediction-market primer, (2) what BitBadges is: the standard and its
 * primitive toolbox, (3) the seven approvals that *are* a prediction market,
 * each card tagged with the primitives it composes (SDK
 * core/prediction-markets.ts). Static Server Component; literal identifiers
 * live in code chips only.
 */

// ---------- primitives ----------

function Slide({ n, kicker, title, children }: { n: string; kicker: string; title: ReactNode; children: ReactNode }) {
  return (
    <section className="scroll-mt-24">
      <div className="mb-6 flex items-center gap-4">
        <span className="wordmark-gradient font-hero text-2xl font-extrabold leading-none sm:text-3xl">{n}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
        <span className="eyebrow">{kicker}</span>
      </div>
      <h2 className="font-display text-2xl font-bold tracking-marquee text-ink sm:text-3xl">{title}</h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-bg/50 px-2.5 py-0.5 text-[11px] text-ink-dim">
      {children}
    </span>
  );
}

// ---------- icons ----------

type IconProps = { className?: string };
const svg = (paths: ReactNode) =>
  function Icon({ className }: IconProps) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {paths}
      </svg>
    );
  };

const IconMint = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9.5a3 2 0 0 1 6 0c0 1-1.5 1.5-3 1.9s-3 .9-3 1.9a3 2 0 0 0 6 0" /></>);
const IconTrade = svg(<path d="M4 8h13l-3-3M20 16H7l3 3" />);
const IconRedeem = svg(<><path d="M3 7l9-4 9 4-9 4-9-4Z" /><path d="M3 7v8l9 4 9-4V7" /></>);
const IconYes = svg(<><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>);
const IconNo = svg(<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>);
const IconPush = svg(<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />);

// block + recipe icons
const IconCash = svg(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M5 9h.01M19 15h.01" /></>);
const IconTokens = svg(<><rect x="3" y="13" width="5" height="7" rx="1" /><rect x="9.5" y="9" width="5" height="11" rx="1" /><rect x="16" y="5" width="5" height="15" rx="1" /></>);
const IconVote = svg(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12l3 3 5-6" /></>);
const IconLimit = svg(<><path d="M5 18a8 8 0 1 1 14 0" /><path d="M12 14l4-3" /></>);
const IconWho = svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="18" cy="7" r="2" /></>);
const IconHoldings = svg(<><path d="M3 8a2 2 0 0 1 2-2h13v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" /><path d="M3 10h17M16 14h.01" /></>);
const IconBurn = svg(<path d="M12 3c1 3 5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 2 2 2 2 .5-3-1-5 1-7Z" />);
const IconPool = svg(<><path d="M3 16c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2" /><path d="M3 20c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2" /><path d="M7 11l5-7 5 7" /></>);
const IconOverTime = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></>);
const IconFee = svg(<><path d="M19 5 5 19" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></>);
const IconHourglass = svg(<><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 0M7 21c0-5 10-5 10 0" /></>);
const IconFreeze = svg(<><path d="M12 2v20M3 7l18 10M21 7 3 17M2.5 12h19" /></>);
const IconList = svg(<><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 1.5-1.5M4 12l1 1 1.5-1.5M4 18l1 1 1.5-1.5" /></>);
const IconRefill = svg(<><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3v5h-5" /></>);
const IconApprovers = svg(<><rect x="3" y="5" width="8" height="6" rx="1" /><rect x="13" y="13" width="8" height="6" rx="1" /><path d="M5 8l1.2 1.2L8 7.5M15 16l1.2 1.2L18 15.5" /></>);
const IconBond = svg(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
const IconUp = svg(<><path d="M5 4h14" /><path d="M12 20V9M7 13l5-5 5 5" /></>);
const IconLockClock = svg(<><rect x="3" y="11" width="11" height="9" rx="2" /><path d="M5.5 11V8a3.5 3.5 0 0 1 7 0v3" /><circle cx="18" cy="7" r="4" /><path d="M18 5.5V7l1 1" /></>);
const IconBox = svg(<><path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z" /><path d="M3 8l9 5 9-5M12 13v8" /></>);
const IconOne = svg(<><circle cx="12" cy="12" r="9" /><path d="M11 8.5 13 7v10M10 17h5" /></>);
const IconHours = svg(<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5M12 2v2M22 12h-2" /></>);
const IconStar = svg(<path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 19.6l1-6L3.3 9.4l6-.9L12 3Z" />);
const IconCurrency = svg(<><circle cx="12" cy="12" r="9" /><path d="M9 9.5a3 2 0 0 1 6 0c0 1-1.5 1.5-3 1.9s-3 .9-3 1.9a3 2 0 0 0 6 0M12 6v12" /></>);

// ---------- data ----------

// BitBadges building blocks (plain English, no dev terms). The first five
// (used:true) are the ones a Meridian market uses; the rest power other tokens.
const BLOCKS = [
  { icon: IconCash, label: 'Move USDC', desc: 'send coins with a transfer', used: true },
  { icon: IconTokens, label: 'Hand out tokens', desc: 'create exact amounts', used: true },
  { icon: IconVote, label: 'Require a vote', desc: 'gate on an oracle or admin', used: true },
  { icon: IconLimit, label: 'Set limits', desc: 'cap how much & how often', used: true },
  { icon: IconWho, label: 'Pick who & when', desc: 'who moves what, and when', used: true },
  { icon: IconHoldings, label: 'Require holdings', desc: 'only if you own another token' },
  { icon: IconBurn, label: 'Burn to redeem', desc: 'destroy tokens to claim or exit' },
  { icon: IconPool, label: 'Liquidity pool', desc: 'built-in pool for trading' },
  { icon: IconOverTime, label: 'Balances over time', desc: 'grow or shrink on a schedule' },
  { icon: IconFee, label: 'Charge a fee', desc: 'take a royalty per transfer' },
  { icon: IconHourglass, label: 'Auto-expire', desc: 'tokens or rules delete themselves' },
  { icon: IconFreeze, label: 'Freeze & claw back', desc: 'issuer can pause or reclaim' },
  { icon: IconList, label: 'Allow / block lists', desc: 'on-chain allow or deny lists' },
  { icon: IconCurrency, label: 'Allowed currencies', desc: 'restrict which coins can pay' },
  { icon: IconRefill, label: 'Refilling limits', desc: 'daily or monthly, auto-reset' },
  { icon: IconApprovers, label: 'Multiple approvers', desc: 'multi-signature sign-off' },
  { icon: IconBond, label: 'Non-transferable', desc: "soulbound, can't be sold" },
  { icon: IconUp, label: 'Increment-only', desc: 'can only go up, with a cap' },
  { icon: IconHours, label: 'Restrict hours', desc: 'no transfers outside set times' },
  { icon: IconLockClock, label: 'Lock until a date', desc: 'vesting-style time locks' },
  { icon: IconBox, label: 'Capped supply', desc: 'a hard limit on how many exist' },
  { icon: IconOne, label: 'One-time use', desc: 'an approval good for a single use' },
];

// The same blocks build many kinds of tokens; a market is one recipe.
const RECIPES = [
  { label: 'Subscriptions', icon: IconRefill },
  { label: 'Backed stablecoins', icon: IconCurrency },
  { label: 'Escrow payments', icon: IconBond },
  { label: 'Loyalty points', icon: IconStar },
  { label: 'Prediction markets', icon: IconYes },
];

// The seven approvals (SDK prediction-markets.ts:390) as plain IF → THEN rules.
const APPROVALS = [
  { n: 1, icon: IconMint, name: 'Mint', phase: 'Enter', tone: 'gold', cond: 'someone pays 1 USDC', result: 'they get 1 YES + 1 NO', blocks: ['move USDC', 'hand out tokens'] },
  { n: 2, icon: IconTrade, name: 'Trade', phase: 'Trade', tone: 'gold', cond: 'a buyer & seller agree', result: 'YES / NO tokens change hands', blocks: ['pick who & when'] },
  { n: 3, icon: IconRedeem, name: 'Redeem', phase: 'Exit', tone: 'gold', cond: 'you hand back 1 YES + 1 NO', result: 'you get 1 USDC back, anytime', blocks: ['move USDC', 'burn the pair'] },
  { n: 4, icon: IconYes, name: 'YES wins', phase: 'Settle', tone: 'yes', cond: 'the oracle votes YES', result: 'each YES pays 1 USDC · NO expires', blocks: ['require a vote', 'pay out'] },
  { n: 5, icon: IconNo, name: 'NO wins', phase: 'Settle', tone: 'no', cond: 'the oracle votes NO', result: 'each NO pays 1 USDC · YES expires', blocks: ['require a vote', 'pay out'] },
  { n: 6, icon: IconPush, name: 'Push YES', phase: 'Settle', tone: 'muted', cond: 'the oracle voids the day', result: 'YES holders are refunded', blocks: ['require a vote', 'refund'] },
  { n: 7, icon: IconPush, name: 'Push NO', phase: 'Settle', tone: 'muted', cond: 'the oracle voids the day', result: 'NO holders are refunded', blocks: ['require a vote', 'refund'] },
];

const TONE: Record<string, { text: string; ring: string; bl: string }> = {
  gold: { text: 'text-gold-bright', ring: 'ring-gold/30', bl: 'border-l-gold/50' },
  yes: { text: 'text-yes', ring: 'ring-yes/30', bl: 'border-l-yes/50' },
  no: { text: 'text-no', ring: 'ring-no/30', bl: 'border-l-no/50' },
  muted: { text: 'text-muted', ring: 'ring-border', bl: 'border-l-border' },
};

// ---------- page ----------

export default function HowItWorksPage() {
  return (
    <div className="space-y-20 animate-fade-in sm:space-y-28">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-clay-lg bg-panel bg-hero-radial px-6 py-14 text-center shadow-clay sm:px-12 sm:py-20">
        <a
          href="https://bitbadges.io"
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-2.5 rounded-full bg-bg/60 py-1.5 pl-2 pr-3.5 shadow-clay-sm transition-transform hover:-translate-y-0.5"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chains/bitbadges.png" alt="BitBadges" width={24} height={24} className="h-full w-full object-cover" />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim">
            Powered by <span className="font-semibold text-gold-bright">BitBadges</span>
          </span>
        </a>
        <h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.12] tracking-marquee sm:text-6xl">
          Tokenize anything.
          <br />
          <span className="text-gold-gradient inline-block pb-[0.06em]">No smart contracts.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-ink-dim sm:text-base">
          BitBadges is a native on-chain token standard. You mix simple building blocks
          to create any asset: payments, stablecoins, escrow, and markets like this one.
        </p>
        <a
          href="https://bitbadges.io"
          target="_blank"
          rel="noreferrer"
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-bg shadow-clay-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          Explore BitBadges →
        </a>
      </section>

      {/* 01 · PREDICTION MARKET */}
      <Slide n="01" kicker="Primer" title={<>Price is probability. YES + NO = 1 USDC.</>}>
        <Card variant="raised">
          <div className="flex h-16 overflow-hidden rounded-clay-sm shadow-clay-sm">
            <div className="flex flex-[62] flex-col items-center justify-center bg-yes/20 ring-1 ring-inset ring-yes/30">
              <span className="font-mono text-lg font-bold text-yes">62¢</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-yes/80">YES</span>
            </div>
            <div className="flex flex-[38] flex-col items-center justify-center bg-no/20 ring-1 ring-inset ring-no/30">
              <span className="font-mono text-lg font-bold text-no">38¢</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-no/80">NO</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-faint">
            <span>62¢ = a 62% chance</span>
            <span className="font-mono text-gold-bright">winner pays 1 USDC</span>
          </div>
        </Card>
      </Slide>

      {/* 02 · WHAT IS BITBADGES: building blocks to anything */}
      <Slide n="02" kicker="The chain" title={<>BitBadges is a native tokenization standard.</>}>
        <p className="-mt-4 mb-7 max-w-2xl text-sm text-ink-dim">
          On most chains, a token is just a balance. BitBadges builds tokenization into
          the chain itself, giving you a kit of building blocks you mix and match to
          create almost any asset. A prediction market is one recipe.
        </p>

        {/* the block wall */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {BLOCKS.map((b) => {
            const Icon = b.icon;
            return (
              <div
                key={b.label}
                className={`flex items-start gap-2.5 rounded-clay-sm border px-3 py-2.5 shadow-clay-sm ${b.used ? 'border-gold/40 bg-gold/[0.05]' : 'border-border bg-panel'}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-clay-sm ${b.used ? 'bg-gold/15 text-gold-bright ring-1 ring-inset ring-gold/30' : 'bg-bg/50 text-muted'}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <span className="font-display text-[13px] font-semibold leading-tight tracking-marquee text-ink">{b.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-dim">{b.desc}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* recipes line */}
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono uppercase tracking-[0.14em] text-faint">mix them to build</span>
          {RECIPES.map((r) => {
            const Icon = r.icon;
            const hot = r.label === 'Prediction markets';
            return (
              <span
                key={r.label}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${hot ? 'bg-gold/15 font-semibold text-gold-bright ring-1 ring-inset ring-gold/40' : 'border border-border bg-bg/40 text-ink-dim'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {r.label}
              </span>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-faint">
          A market uses the <span className="text-gold-bright">five highlighted</span> blocks. The rest power everything else.
        </p>
      </Slide>

      {/* 03 · THE SEVEN APPROVALS: cards with primitives */}
      <Slide n="03" kicker="The recipe" title={<>Seven rules make a market.</>}>
        <ol className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {APPROVALS.map((a) => {
            const Icon = a.icon;
            const tone = TONE[a.tone];
            return (
              <li key={a.n}>
                <Card variant="flat" className={`flex h-full flex-col border-l-4 ${tone.bl}`}>
                  <div className="flex items-center justify-between">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-clay-sm bg-bg/50 ring-1 ring-inset ${tone.text} ${tone.ring}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{a.phase}</span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-mono text-xs text-faint">{a.n}</span>
                    <span className="font-display text-lg font-semibold tracking-marquee text-ink">{a.name}</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm leading-snug text-ink-dim">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">if </span>
                      {a.cond}
                    </p>
                    <p className="text-sm leading-snug text-ink">
                      <span className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${tone.text}`}>then </span>
                      {a.result}
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    {a.blocks.map((p) => (
                      <Tag key={p}>{p}</Tag>
                    ))}
                  </div>
                </Card>
              </li>
            );
          })}
          <li>
            <div className="flex h-full flex-col justify-center rounded-clay border-2 border-dashed border-gold/30 bg-gold/[0.04] px-5 py-6 text-center">
              <span className="wordmark-gradient font-hero text-3xl font-extrabold leading-none">7 rules</span>
              <span className="mt-2 text-sm text-ink-dim">= a full market, settled on-chain.</span>
            </div>
          </li>
        </ol>
      </Slide>

      {/* CTA */}
      <section className="flex flex-col items-center gap-4 pb-4 text-center">
        <Link
          href="/markets"
          className="rounded-full bg-gold px-8 py-3 text-base font-semibold text-bg shadow-clay transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          Browse markets →
        </Link>
      </section>
    </div>
  );
}
