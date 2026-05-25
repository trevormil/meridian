import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export const metadata = {
  title: 'How it works · Meridian',
  description:
    'Meridian is a prediction market that is literally seven on-chain approvals. A quick primer on prediction markets, then the real story: what BitBadges is and how its programmable token standard makes a market out of rules.',
};

/**
 * Visual, slide-style explainer aimed at a crypto-literate but non-technical
 * reader. Prediction markets get a brief primer; the meat is BitBadges — its
 * programmable token standard, the transferability/approval model, and the
 * seven approvals that *are* a Meridian market (SDK:
 * core/prediction-markets.ts:390). Static Server Component; reuses the app's
 * clay/gold styling. Plain prose; literal field/standard names live in code
 * chips only.
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

/** Inline code chip — the only place literal chain identifiers may appear. */
function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-border bg-bg/60 px-1.5 py-0.5 font-mono text-[0.8em] text-gold-bright">
      {children}
    </code>
  );
}

function Yes({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-yes">{children}</span>;
}
function No({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-no">{children}</span>;
}

// ---------- icons ----------

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

const IconMint = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M8.5 9.5a3.5 2 0 0 1 7 0c0 1.1-1.6 1.6-3.5 2s-3.5.9-3.5 2a3.5 2 0 0 0 7 0" />
  </>,
);
const IconTrade = svg(<path d="M4 8h13l-3-3M20 16H7l3 3" />);
const IconRedeem = svg(
  <>
    <path d="M3 7l9-4 9 4-9 4-9-4Z" />
    <path d="M3 7v8l9 4 9-4V7M12 11v8" />
  </>,
);
const IconYes = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12l3 3 5-6" />
  </>,
);
const IconNo = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </>,
);
const IconPush = svg(
  <>
    <path d="M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4" />
  </>,
);
const IconCode = svg(<path d="M8 6 3 12l5 6M16 6l5 6-5 6M13 4l-2 16" />);
const IconShield = svg(
  <>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />
    <path d="M9 12l2 2 4-4" />
  </>,
);
const IconLego = svg(
  <>
    <rect x="4" y="9" width="16" height="11" rx="1.5" />
    <path d="M8 9V6.5a1.5 1.5 0 0 1 3 0V9M13 9V6.5a1.5 1.5 0 0 1 3 0V9" />
  </>,
);

// ---------- data ----------

// The six fields every transfer is matched against (BitBadges docs:
// learn/transferability.md "Six Core Fields").
const DIMENSIONS = [
  { q: 'Who sends?', plain: 'the from address', chip: 'fromListId' },
  { q: 'Who receives?', plain: 'the to address', chip: 'toListId' },
  { q: 'Who triggers it?', plain: 'who initiates', chip: 'initiatedByListId' },
  { q: 'When?', plain: 'the allowed time window', chip: 'transferTimes' },
  { q: 'Which token?', plain: 'YES or NO here', chip: 'tokenIds' },
  { q: 'For which period?', plain: 'the ownership time', chip: 'ownershipTimes' },
];

// The 7 approvals that ARE a prediction market (SDK prediction-markets.ts:390),
// grouped onto the market lifecycle.
const APPROVALS = [
  {
    phase: 'Enter',
    icon: IconMint,
    tone: 'gold',
    name: 'Mint',
    body: 'Pay $1 and the collection creates one matched YES + NO pair for you. The dollar is escrowed by the approval itself.',
  },
  {
    phase: 'Trade',
    icon: IconTrade,
    tone: 'gold',
    name: 'Transferable',
    body: 'The one approval that lets YES and NO tokens move freely between traders and the liquidity pool. This is what makes a market.',
  },
  {
    phase: 'Exit early',
    icon: IconRedeem,
    tone: 'gold',
    name: 'Redeem',
    body: 'Hand back a YES + NO pair before settlement and get your $1 back. The two sides always net to a dollar.',
  },
  {
    phase: 'Settle',
    icon: IconYes,
    tone: 'yes',
    name: 'YES wins',
    body: 'If the stock closed at or above the strike, every YES token redeems for $1 and NO becomes worthless.',
  },
  {
    phase: 'Settle',
    icon: IconNo,
    tone: 'no',
    name: 'NO wins',
    body: 'If it closed below, the mirror image: every NO token redeems for $1 and YES expires.',
  },
  {
    phase: 'Settle',
    icon: IconPush,
    tone: 'muted',
    name: 'Push YES',
    body: 'The void path for the YES side — if the market is called off, holders are refunded instead of paid out.',
  },
  {
    phase: 'Settle',
    icon: IconPush,
    tone: 'muted',
    name: 'Push NO',
    body: 'The matching void path for NO. Together the two pushes mean a no-contest day returns everyone’s dollar.',
  },
];

const TONE_RING: Record<string, string> = {
  gold: 'text-gold-bright ring-gold/30',
  yes: 'text-yes ring-yes/30',
  no: 'text-no ring-no/30',
  muted: 'text-muted ring-border',
};

// ---------- page ----------

export default function HowItWorksPage() {
  return (
    <div className="space-y-24 animate-fade-in sm:space-y-36">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden rounded-clay-lg bg-panel bg-hero-radial px-6 py-16 text-center shadow-clay sm:px-12 sm:py-24">
        <a
          href="https://bitbadges.io"
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-2.5 rounded-full bg-bg/60 py-2 pl-2.5 pr-4 shadow-clay-sm transition-transform duration-150 hover:-translate-y-0.5"
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
        <h1 className="mx-auto mt-6 max-w-4xl font-display text-4xl font-bold leading-[1.02] tracking-marquee sm:text-6xl">
          A prediction market is <span className="text-gold-gradient">just seven approvals.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-dim sm:text-lg">
          Meridian didn't write a settlement contract or a matching engine. It
          wired together seven rules that the BitBadges chain already knows how to
          enforce. Here's the whole trick.
        </p>
      </section>

      {/* ===== 01 · PREDICTION MARKETS (brief) ===== */}
      <Slide n="01" kicker="Quick primer">
        <Headline>First, the thing you already get: a prediction market.</Headline>
        <Lead>
          You buy <Yes>YES</Yes> or <No>NO</No> on a question with a clear answer —
          here, “does this stock close at or above this price today?” The price is
          the market's odds, and the winning side pays exactly $1. That's the whole
          game. Now for the interesting part.
        </Lead>

        <Card variant="raised" className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
              Price is just probability
            </span>
            <span className="font-mono text-sm font-semibold text-gold-bright">YES + NO = $1.00</span>
          </div>
          <div className="flex h-14 overflow-hidden rounded-clay-sm shadow-clay-sm">
            <div className="flex flex-[62] items-center justify-center bg-yes/20 font-mono text-sm font-bold text-yes ring-1 ring-inset ring-yes/30">
              YES · 62¢
            </div>
            <div className="flex flex-[38] items-center justify-center bg-no/20 font-mono text-sm font-bold text-no ring-1 ring-inset ring-no/30">
              NO · 38¢
            </div>
          </div>
          <p className="mt-3 text-xs text-faint">A 62¢ YES means the market gives it a 62% chance.</p>
        </Card>
      </Slide>

      {/* ===== 02 · WHAT IS BITBADGES (the meat) ===== */}
      <Slide n="02" kicker="The real story">
        <Headline>So what is BitBadges?</Headline>
        <Lead>
          It's a blockchain whose tokens carry their own rulebook. On most chains a
          token is just a balance, and anything clever — vesting, escrow, payouts —
          has to be a separate smart contract you write, audit, and pray over. On
          BitBadges, those rules live <span className="text-ink">inside the token standard</span>.
          You don't deploy a contract; you configure a token.
        </Lead>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          <Card variant="raised" className="flex flex-col">
            <IconLego className="h-7 w-7 text-gold-bright" />
            <span className="mt-5 font-display text-lg font-semibold tracking-marquee text-ink">
              Rules, not contracts
            </span>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              Minting, escrow, payouts and trading are configuration on the token —
              not custom code. Nothing to deploy or audit.
            </p>
          </Card>
          <Card variant="raised" className="flex flex-col">
            <IconShield className="h-7 w-7 text-gold-bright" />
            <span className="mt-5 font-display text-lg font-semibold tracking-marquee text-ink">
              The chain is the referee
            </span>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              Every rule is enforced in protocol code. The $1 payout can't be
              skipped, double-spent, or rugged by an operator.
            </p>
          </Card>
          <Card variant="raised" className="flex flex-col">
            <IconCode className="h-7 w-7 text-gold-bright" />
            <span className="mt-5 font-display text-lg font-semibold tracking-marquee text-ink">
              You keep custody
            </span>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              Tokens and cash sit in your own account the whole time. There's no
              vault contract holding the bag.
            </p>
          </Card>
        </div>
      </Slide>

      {/* ===== 03 · APPROVALS / TRANSFERABILITY ===== */}
      <Slide n="03" kicker="The key idea: approvals">
        <Headline>Every transfer has to pass a rulebook called an approval.</Headline>
        <Lead>
          This is the BitBadges superpower. Tokens don't just move — each move is
          checked against approvals that answer six questions. Set those rules
          cleverly and you've described escrow, payouts, or an order book without a
          single line of contract code.
        </Lead>

        {/* six dimensions */}
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DIMENSIONS.map((d, i) => (
            <div key={d.chip} className="rounded-clay border border-border bg-panel px-4 py-3 shadow-clay-sm">
              <div className="flex items-center justify-between">
                <span className="font-display text-base font-semibold tracking-marquee text-ink">{d.q}</span>
                <span className="font-mono text-[10px] text-faint">{i + 1}/6</span>
              </div>
              <p className="mt-1 text-xs text-ink-dim">{d.plain}</p>
              <span className="mt-2 inline-block">
                <Code>{d.chip}</Code>
              </span>
            </div>
          ))}
        </div>

        {/* three levels */}
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <LevelCard title="Collection level" body="Rules the market's creator sets for everyone." />
          <LevelCard title="Sender level" body="What the person sending tokens allows." />
          <LevelCard title="Recipient level" body="What the person receiving tokens allows." />
        </div>
        <p className="mt-4 max-w-2xl text-sm text-faint">
          A transfer only goes through if all three levels agree — and approvals can
          go further: require proofs, cap amounts, take a royalty, or move cash
          alongside the tokens (<Code>coinTransfers</Code>). That last one is exactly
          how dollars flow when you mint or get paid out.
        </p>
      </Slide>

      {/* ===== 04 · THE SEVEN APPROVALS (payoff) ===== */}
      <Slide n="04" kicker="Putting it together">
        <Headline>A Meridian market is seven approvals on one collection.</Headline>
        <Lead>
          That's the punchline. Wire up these seven rules and the chain does the
          rest — minting, trading, refunds, and settling to $1. No bespoke
          contract anywhere.
        </Lead>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {APPROVALS.map((a, i) => {
            const Icon = a.icon;
            return (
              <li key={a.name}>
                <Card variant="flat" className="flex h-full flex-col">
                  <div className="flex items-center justify-between">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-clay-sm bg-bg/50 ring-1 ring-inset ${TONE_RING[a.tone]}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                      {a.phase}
                    </span>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-mono text-sm text-faint">{i + 1}</span>
                    <span className="font-display text-lg font-semibold tracking-marquee text-ink">
                      {a.name}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-dim">{a.body}</p>
                </Card>
              </li>
            );
          })}
          {/* filler cell with the takeaway, sits in the 8th grid slot */}
          <li>
            <div className="flex h-full flex-col justify-center rounded-clay border-2 border-dashed border-gold/30 bg-gold/[0.04] px-5 py-6 text-center">
              <span className="wordmark-gradient font-hero text-3xl font-extrabold leading-none">7 rules</span>
              <span className="mt-2 text-sm text-ink-dim">= a full prediction market, settled on-chain.</span>
            </div>
          </li>
        </ol>

        <Card variant="flat" accent="gold" className="mt-8">
          <p className="text-sm leading-relaxed text-ink-dim">
            All seven are locked at creation, so the rules can't change mid-market.
            Settlement is a single signed vote from a trusted price reporter — and in
            production, the standard can require several reporters to agree before a
            dollar moves.
          </p>
        </Card>
      </Slide>

      {/* ===== CTA ===== */}
      <section className="flex flex-col items-center gap-5 pb-6 text-center">
        <h2 className="font-display text-3xl font-bold tracking-marquee text-ink sm:text-4xl">
          That's the whole trick.
        </h2>
        <p className="max-w-md text-base text-ink-dim">
          Seven rules, one chain, real markets. Go place a prediction.
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

// ---------- small pieces ----------

function LevelCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-clay border border-border border-l-4 border-l-gold/50 bg-panel px-4 py-3 shadow-clay-sm">
      <span className="font-display text-sm font-semibold tracking-marquee text-ink">{title}</span>
      <p className="mt-1 text-sm leading-relaxed text-ink-dim">{body}</p>
    </div>
  );
}
