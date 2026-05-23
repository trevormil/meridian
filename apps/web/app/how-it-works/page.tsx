import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export const metadata = {
  title: 'How it works · Meridian',
  description:
    'A visual walkthrough of Meridian — daily MAG7 prediction markets built on the BitBadges native prediction-market primitive. The chain, the $1 payoff, the order book, and the price oracle.',
};

/**
 * Visual, slide-style explainer. Each section is a "slide": a big numbered
 * kicker, one punchy headline, a few key points, and a diagram built from
 * CSS/SVG. Light on prose — this is a deck, not docs. BitBadges leads (the
 * whole pitch is "the chain already is a prediction market"), so the chain +
 * its primitives are section 01. Static Server Component; reuses the app's
 * clay/gold styling. Plain-language prose; chain identifiers live in code
 * chips, never in sentences.
 */

// ---------- layout primitives ----------

function Slide({ n, kicker, children }: { n: string; kicker: string; children: ReactNode }) {
  return (
    <section className="scroll-mt-24">
      <div className="mb-8 flex items-center gap-4">
        <span className="wordmark-gradient font-hero text-3xl font-extrabold leading-none sm:text-4xl">
          {n}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
        <span className="eyebrow">{kicker}</span>
      </div>
      {children}
    </section>
  );
}

function Headline({ children }: { children: ReactNode }) {
  return (
    <h2 className="max-w-3xl font-display text-3xl font-bold leading-[1.08] tracking-marquee text-ink sm:text-4xl">
      {children}
    </h2>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-dim">{children}</p>;
}

/** Inline code chip — the only place chain identifiers are allowed to appear. */
function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-border bg-bg/60 px-1.5 py-0.5 font-mono text-[0.8em] text-gold-bright">
      {children}
    </code>
  );
}

// ---------- icons (compact stroke set) ----------

type IconProps = { className?: string };
const svg = (paths: ReactNode) =>
  function Icon({ className }: IconProps) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths}
      </svg>
    );
  };

const IconCreate = svg(
  <>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4M12 12v5M9.5 14.5h5" />
  </>,
);
const IconOpen = svg(
  <>
    <path d="M12 3v3M5 7l2 2M19 7l-2 2M5 14a7 7 0 0 1 14 0" />
    <path d="M2 14h20M9 18h6" />
  </>,
);
const IconClose = svg(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);
const IconSettle = svg(
  <>
    <path d="M3 21h18M6 21V10M18 21V10M4 10l8-6 8 6" />
    <path d="M9 21v-5h6v5" />
  </>,
);
const IconBolt = svg(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />);
const IconShield = svg(
  <>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />
    <path d="M9 12l2 2 4-4" />
  </>,
);
const IconCode = svg(<path d="M8 6 3 12l5 6M16 6l5 6-5 6M13 4l-2 16" />);
const IconBot = svg(
  <>
    <rect x="4" y="8" width="16" height="11" rx="2" />
    <path d="M12 4v4M8 13h.01M16 13h.01M9 17h6" />
    <circle cx="12" cy="3" r="1" />
  </>,
);
const IconPair = svg(
  <>
    <circle cx="8" cy="8" r="4" />
    <circle cx="16" cy="16" r="4" />
    <path d="M8 12v0M11 13l2-2" />
  </>,
);
const IconBook = svg(
  <>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
    <path d="M9 7h6M9 11h6" />
  </>,
);
const IconVote = svg(
  <>
    <path d="M9 12l2 2 4-5" />
    <rect x="3" y="4" width="18" height="16" rx="2" />
  </>,
);
const IconGroup = svg(
  <>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 6a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" />
  </>,
);
const IconClock = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);

// ---------- data ----------

const PILLARS = [
  {
    icon: IconCode,
    stat: 'Zero',
    label: 'custom settlement code',
    note: 'The $1 payout rule and vote-to-settle ship in the chain’s token standard — not in our app.',
  },
  {
    icon: IconBolt,
    stat: '~1.5s',
    label: 'block finality',
    note: 'Fast enough that the on-chain order book never feels like the bottleneck.',
  },
  {
    icon: IconShield,
    stat: '$1.00',
    label: 'invariant, enforced on-chain',
    note: 'A winning token is always redeemable for exactly one dollar — the protocol guarantees it.',
  },
];

const PRIMITIVES = [
  {
    icon: IconPair,
    title: 'Paired YES / NO tokens',
    body: 'One deposit mints a matched pair. Exactly one side wins, and the chain redeems the winner for $1 — that invariant is protocol code, not ours.',
    chip: 'prediction-market standard',
  },
  {
    icon: IconBook,
    title: 'Intent-based order book',
    body: 'Every limit order is an on-chain approval. A trade is a single transfer that references two approvals and runs them together atomically — no match engine.',
    chip: 'approvals + atomic transfer',
  },
  {
    icon: IconVote,
    title: 'Verifier-vote settlement',
    body: 'A designated address settles a market by casting an on-chain vote. The chain enforces that only that address can decide that market’s outcome.',
    chip: 'MsgCastVote',
  },
  {
    icon: IconGroup,
    title: 'k-of-n verifiers',
    body: 'Production can require several independent verifiers to agree before a market settles, so no single key can settle alone — a config change, not new code.',
    chip: 'votingChallenges[]',
  },
  {
    icon: IconClock,
    title: 'Programmable balances',
    body: 'Approvals, permissions and time-bound balances let the standard encode trading windows and outcome-based redemption directly into the token.',
    chip: 'time-based balances',
  },
  {
    icon: IconShield,
    title: 'Custody-free by design',
    body: 'Funds and tokens live in your account the whole time. There is no escrow contract and no operator that can move them.',
    chip: 'self-custody',
  },
];

const LIFECYCLE = [
  { time: '8:00 AM', label: 'Create', icon: IconCreate, note: 'Fresh markets minted + auto-seeded with liquidity' },
  { time: '9:30 AM', label: 'Open', icon: IconOpen, note: 'Trading begins — buy YES or NO' },
  { time: '4:00 PM', label: 'Close', icon: IconClose, note: 'Last quote taken, trading stops' },
  { time: '4:05 PM', label: 'Settle', icon: IconSettle, note: 'Oracle votes, winners redeem for $1' },
];

const ARBS = [
  { title: 'Cheap pair', a: 'YES 45¢', b: 'NO 45¢', sum: '90¢', action: 'buy both, redeem the pair for $1.00', profit: '+10¢' },
  { title: 'Rich pair', a: 'YES 55¢', b: 'NO 52¢', sum: '$1.07', action: 'mint a pair for $1.00, sell both', profit: '+7¢' },
  { title: 'Crossed book', a: 'bid 60¢', b: 'ask 56¢', sum: '—', action: 'cross the two orders, keep the spread', profit: '+4¢' },
];

// ---------- page ----------

export default function HowItWorksPage() {
  return (
    <div className="space-y-24 animate-fade-in sm:space-y-36">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden rounded-clay-lg bg-panel bg-hero-radial px-6 py-16 text-center shadow-clay sm:px-12 sm:py-24">
        <span className="eyebrow">How it works</span>
        <h1 className="mx-auto mt-4 max-w-4xl font-display text-4xl font-bold leading-[1.02] tracking-marquee sm:text-6xl">
          <span className="text-gold-gradient">One trading day.</span>
          <br />
          One settle. One dollar.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-dim sm:text-lg">
          Bet yes or no on where the seven biggest tech stocks close each day.
          Every winning contract pays exactly $1 — settled on-chain the moment
          the market closes.
        </p>
        <a
          href="https://bitbadges.io"
          target="_blank"
          rel="noreferrer"
          className="group mt-8 inline-flex items-center gap-2.5 rounded-full bg-bg/60 py-2 pl-2.5 pr-4 shadow-clay-sm transition-transform duration-150 hover:-translate-y-0.5"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chains/bitbadges.png" alt="BitBadges" width={28} height={28} className="h-full w-full object-cover" />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim">
            Built on{' '}
            <span className="font-semibold text-gold-bright group-hover:text-gold">BitBadges</span>
          </span>
        </a>
      </section>

      {/* ===== 01 · BUILT ON BITBADGES (lead) ===== */}
      <Slide n="01" kicker="Built on BitBadges">
        <Headline>We didn't build a prediction market. The chain already is one.</Headline>
        <Lead>
          Most teams start by writing the risky financial logic — minting, payouts,
          settlement — from scratch. We didn't have to. BitBadges ships a
          prediction market as a native token type, so the rules that protect your
          money are enforced by the chain itself.
        </Lead>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.label} variant="raised" className="flex flex-col">
                <Icon className="h-7 w-7 text-gold-bright" />
                <span className="wordmark-gradient mt-5 font-hero text-4xl font-extrabold leading-none">
                  {p.stat}
                </span>
                <span className="mt-1 font-display text-base font-semibold tracking-marquee text-ink">
                  {p.label}
                </span>
                <p className="mt-3 text-sm leading-relaxed text-ink-dim">{p.note}</p>
              </Card>
            );
          })}
        </div>

        {/* primitives deep-dive */}
        <div className="mt-14">
          <div className="mb-6 flex items-end justify-between border-b border-border pb-2">
            <span className="eyebrow">The primitives we use</span>
            <span className="font-mono text-[10px] tracking-[0.18em] text-faint">native to the chain</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRIMITIVES.map((p) => {
              const Icon = p.icon;
              return (
                <Card key={p.title} variant="flat" className="flex h-full flex-col">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-clay-sm bg-bg/50 text-gold-bright">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="font-display text-base font-semibold leading-tight tracking-marquee text-ink">
                      {p.title}
                    </h3>
                  </div>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-dim">{p.body}</p>
                  <span className="mt-4 w-fit">
                    <Code>{p.chip}</Code>
                  </span>
                </Card>
              );
            })}
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faint">
            The upshot: Meridian is mostly glue. The chain handles minting,
            matching, the dollar invariant, and settlement — we add the daily
            schedule, the price feeds, and the interface.
          </p>
        </div>
      </Slide>

      {/* ===== 02 · THE PAYOFF ===== */}
      <Slide n="02" kicker="The core idea">
        <Headline>Every market is a coin with two sides that always add up to $1.</Headline>
        <Lead>
          Think a stock closes at or above a price today? Buy <Yes>YES</Yes>. Think
          it closes below? Buy <No>NO</No>. The prices are mirror images — when one
          is cheap, the other is dear — and a matching pair is always worth a dollar.
        </Lead>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card variant="raised" className="flex flex-col justify-center">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
                Live price split
              </span>
              <span className="font-mono text-sm font-semibold text-gold-bright">= $1.00</span>
            </div>
            <div className="flex h-16 overflow-hidden rounded-clay-sm shadow-clay-sm">
              <div className="flex flex-[62] items-center justify-center bg-yes/20 font-mono text-sm font-bold text-yes ring-1 ring-inset ring-yes/30">
                YES · 62¢
              </div>
              <div className="flex flex-[38] items-center justify-center bg-no/20 font-mono text-sm font-bold text-no ring-1 ring-inset ring-no/30">
                NO · 38¢
              </div>
            </div>
            <p className="mt-3 text-xs text-faint">
              The market thinks there's a 62% chance this one closes in the money.
            </p>
          </Card>

          <div className="grid gap-4">
            <Card variant="flat" accent="yes" className="flex items-center justify-between">
              <div>
                <p className="font-display text-lg font-semibold tracking-marquee text-ink">
                  Closes at or above
                </p>
                <p className="text-sm text-ink-dim">Your YES shares pay out</p>
              </div>
              <span className="font-mono text-2xl font-bold text-yes">$1.00</span>
            </Card>
            <Card variant="flat" accent="no" className="flex items-center justify-between">
              <div>
                <p className="font-display text-lg font-semibold tracking-marquee text-ink">
                  Closes below
                </p>
                <p className="text-sm text-ink-dim">Your NO shares pay out</p>
              </div>
              <span className="font-mono text-2xl font-bold text-no">$1.00</span>
            </Card>
          </div>
        </div>
      </Slide>

      {/* ===== 03 · THE TRADING DAY ===== */}
      <Slide n="03" kicker="The trading day">
        <Headline>Markets are born and settled inside a single day.</Headline>
        <Lead>
          Two scheduled jobs bookend each session — both skip weekends and market
          holidays automatically.
        </Lead>

        <div className="relative mt-12">
          <div className="absolute left-0 right-0 top-7 hidden h-0.5 bg-gradient-to-r from-gold/10 via-gold/40 to-gold/10 sm:block" />
          <ol className="grid gap-8 sm:grid-cols-4 sm:gap-4">
            {LIFECYCLE.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.label} className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border-2 border-gold/50 bg-panel text-gold-bright shadow-clay-sm">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="mt-4 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-gold">
                    {s.time}
                  </span>
                  <span className="mt-1 font-display text-xl font-semibold tracking-marquee text-ink">
                    {s.label}
                  </span>
                  <span className="mt-2 max-w-[16rem] text-sm leading-snug text-ink-dim">
                    {s.note}
                  </span>
                  <span className="mt-3 font-mono text-[10px] text-faint">{i + 1} / 4</span>
                </li>
              );
            })}
          </ol>
        </div>
      </Slide>

      {/* ===== 04 · THE ORDER BOOK ===== */}
      <Slide n="04" kicker="The order book">
        <Headline>No matching engine. Just orders on-chain that anyone can cross.</Headline>
        <Lead>
          Every limit order is a tiny on-chain permission slip. A trade is one
          atomic transfer that fills two slips at once.
        </Lead>

        <div className="mt-10 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <FlowStep title="You post an order" body={'"I’ll pay 60¢ for 5 YES shares" — recorded on-chain.'} />
          <FlowArrow />
          <FlowStep title="Someone matches" body="A trader or our bot submits the transfer that crosses two orders." />
          <FlowArrow />
          <FlowStep title="Settled atomically" body="Tokens and cash swap in one block — no escrow, no middleman." />
        </div>

        <div className="mt-12 flex items-center gap-3">
          <IconBot className="h-6 w-6 text-gold-bright" />
          <h3 className="font-display text-xl font-semibold tracking-marquee text-ink">
            An always-on bot keeps prices honest
          </h3>
        </div>
        <Lead>
          Every block it scans for three mispricings and trades them away — so a
          brand-new market already feels like a live exchange.
        </Lead>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {ARBS.map((p) => (
            <Card key={p.title} variant="flat" className="flex flex-col">
              <span className="font-display text-base font-semibold tracking-marquee text-ink">
                {p.title}
              </span>
              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm">
                <span className="text-yes">{p.a}</span>
                <span className="text-faint">+</span>
                <span className="text-no">{p.b}</span>
                {p.sum !== '—' && (
                  <>
                    <span className="text-faint">=</span>
                    <span className="text-ink">{p.sum}</span>
                  </>
                )}
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-dim">{p.action}</p>
              <span className="mt-4 inline-flex w-fit rounded-full bg-gold/10 px-3 py-1 font-mono text-sm font-bold text-gold-bright ring-1 ring-inset ring-gold/30">
                {p.profit}
              </span>
            </Card>
          ))}
        </div>
      </Slide>

      {/* ===== 05 · THE ORACLE ===== */}
      <Slide n="05" kicker="The price oracle">
        <Headline>Settlement never trusts a single number.</Headline>
        <Lead>
          The oracle reads three independent price feeds, takes the middle value,
          and only settles once the reading clears three guards.
        </Lead>

        <div className="mt-10 grid items-center gap-4 lg:grid-cols-[auto_auto_auto_auto_auto]">
          <div className="grid gap-2">
            {['Yahoo', 'Yahoo (backup)', 'Stooq'].map((f) => (
              <span
                key={f}
                className="rounded-clay-sm border border-border bg-bg/50 px-4 py-2 text-center font-mono text-sm text-ink"
              >
                {f}
              </span>
            ))}
          </div>
          <FlowArrow />
          <div className="rounded-clay border-2 border-gold/40 bg-panel px-6 py-5 text-center shadow-clay-sm">
            <span className="block font-hero text-xl font-extrabold text-gold-bright">median</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              middle of three
            </span>
          </div>
          <FlowArrow />
          <div className="rounded-clay border border-border bg-bg/40 px-5 py-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              must pass
            </span>
            <ul className="mt-2 space-y-1.5 text-sm">
              <Guard>≥ 2 feeds answered</Guard>
              <Guard>they agree within 1%</Guard>
              <Guard>session truly closed</Guard>
            </ul>
          </div>
        </div>

        <Card variant="flat" accent="gold" className="mt-8">
          <p className="text-sm leading-relaxed text-ink-dim">
            The outcome is posted as a signed on-chain vote, so anyone can replay
            the price lookups for a given day and check the result.
          </p>
        </Card>
      </Slide>

      {/* ===== 06 · THE STACK ===== */}
      <Slide n="06" kicker="Under the hood">
        <Headline>The chain holds the money. Everything else is a thin layer.</Headline>

        <div className="mt-10 space-y-3">
          <StackLayer
            tone="you"
            title="You"
            body="Connect Keplr or MetaMask. No custodian, no sign-up — you trade from keys you control."
          />
          <StackConnector />
          <StackLayer
            tone="app"
            title="App + live indexer"
            body="A Next.js app and a lightweight service serve market lists, price charts, and the order book — updating in realtime, no refresh."
          />
          <StackConnector />
          <StackLayer
            tone="chain"
            title="BitBadges chain"
            body="Holds the funds and enforces the rules: the $1 invariant, the order book, and vote-based settlement."
          />
        </div>
      </Slide>

      {/* ===== HONEST LIMITS ===== */}
      <section>
        <Card variant="hero" className="bg-hero-radial">
          <span className="eyebrow">Keeping it honest</span>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-marquee text-ink sm:text-3xl">
            This is a demo, and we say so.
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <LimitCard title="Test network">No real money is at stake.</LimitCard>
            <LimitCard title="One server, one key">
              A single settlement key signs every vote — fine for a demo, hardened for production.
            </LimitCard>
            <LimitCard title="Shared price source">
              Public feeds share upstream data, so a market-wide bad print could slip through.
            </LimitCard>
          </div>
          <p className="mt-6 text-xs text-faint">
            Nothing here is investment, legal, or tax advice.
          </p>
        </Card>
      </section>

      {/* ===== CTA ===== */}
      <section className="flex flex-col items-center gap-5 pb-6 text-center">
        <h2 className="font-display text-3xl font-bold tracking-marquee text-ink sm:text-4xl">
          See it live.
        </h2>
        <p className="max-w-md text-base text-ink-dim">
          Browse today's markets and place your first prediction.
        </p>
        <Link
          href="/markets"
          className="rounded-full bg-gold px-8 py-3 text-base font-semibold text-bg shadow-clay transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
        >
          Browse markets →
        </Link>
      </section>
    </div>
  );
}

// ---------- small inline pieces ----------

function Yes({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-yes">{children}</span>;
}
function No({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-no">{children}</span>;
}

function FlowStep({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col rounded-clay border border-border bg-panel px-5 py-4 shadow-clay-sm">
      <span className="font-display text-base font-semibold tracking-marquee text-ink">{title}</span>
      <span className="mt-2 text-sm leading-relaxed text-ink-dim">{body}</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center text-gold/60">
      <span className="hidden text-xl sm:inline">→</span>
      <span className="text-xl sm:hidden">↓</span>
    </div>
  );
}

function Guard({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-ink-dim">
      <svg
        className="h-4 w-4 shrink-0 text-yes"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12l5 5 9-11" />
      </svg>
      {children}
    </li>
  );
}

const STACK_TONES = {
  you: 'border-l-yes/60',
  app: 'border-l-gold/60',
  chain: 'border-l-no/60',
} as const;

function StackLayer({
  tone,
  title,
  body,
}: {
  tone: keyof typeof STACK_TONES;
  title: string;
  body: string;
}) {
  return (
    <div
      className={`rounded-clay border border-border ${STACK_TONES[tone]} border-l-4 bg-panel px-6 py-5 shadow-clay-sm`}
    >
      <span className="font-display text-lg font-semibold tracking-marquee text-ink">{title}</span>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-dim">{body}</p>
    </div>
  );
}

function StackConnector() {
  return (
    <div className="flex justify-center text-faint">
      <span className="text-lg leading-none">↕</span>
    </div>
  );
}

function LimitCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-clay-sm bg-bg/40 px-4 py-3">
      <span className="font-display text-sm font-semibold tracking-marquee text-ink">{title}</span>
      <p className="mt-1 text-sm leading-relaxed text-ink-dim">{children}</p>
    </div>
  );
}
