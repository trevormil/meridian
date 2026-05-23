import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export const metadata = {
  title: 'How it works · Meridian',
  description:
    'How Meridian runs daily MAG7 prediction markets on BitBadges — the lifecycle, the order book, the price oracle, and the architecture behind the demo.',
};

/**
 * Static explainer page. No wallet / realtime state, so it stays a Server
 * Component. Mirrors the home + portfolio styling vocabulary (eyebrow labels,
 * clay cards, gold-gradient display headings) so it reads as part of the app,
 * not a docs bolt-on. Prose is kept plain; chain identifiers live in code
 * chips, never in sentences.
 */

const LIFECYCLE = [
  {
    time: '8:00 AM',
    label: 'Create',
    body: 'A scheduled job generates the day’s markets — one set of strike prices per MAG7 name — and posts them on-chain. A liquidity bot immediately seeds each one with two-sided orders so there’s always a counter-party.',
  },
  {
    time: '9:30 AM',
    label: 'Open',
    body: 'Trading begins when the US market opens. You buy YES if you think the stock closes at or above the strike, NO if you think it closes below. Every YES + NO pair is always worth exactly $1.',
  },
  {
    time: '4:00 PM',
    label: 'Close',
    body: 'The US market closes and the last quote is taken. No more trading — the only thing left is to determine the outcome and pay out the winners.',
  },
  {
    time: '4:05 PM',
    label: 'Settle',
    body: 'The oracle reads the official closing price, decides each market’s outcome, and records a settlement vote on-chain. Winning tokens redeem for $1 each; losing tokens expire worthless.',
  },
];

const ARB_PATTERNS = [
  {
    title: 'Cheap pair',
    body: 'When YES and NO can be bought together for less than $1, the bot buys both and redeems the pair for a guaranteed $1 — pocketing the difference and tightening the price.',
  },
  {
    title: 'Rich pair',
    body: 'When YES and NO can be sold together for more than $1, the bot mints a fresh pair for $1 and sells both — again closing the gap toward a fair $1 total.',
  },
  {
    title: 'Crossed book',
    body: 'When a bid on one side sits above an ask on the same side, the bot crosses the two orders and keeps the spread, just like a matching engine would.',
  },
];

function SectionHeader({ kicker, n }: { kicker: string; n: string }) {
  return (
    <div className="mb-5 flex items-end justify-between border-b border-border pb-2">
      <span className="eyebrow">{kicker}</span>
      <span className="font-mono text-[10px] tracking-[0.18em] text-faint">{n}</span>
    </div>
  );
}

/** Inline code chip — the only place chain identifiers are allowed to appear. */
function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-border bg-bg/60 px-1.5 py-0.5 font-mono text-[0.8em] text-gold-bright">
      {children}
    </code>
  );
}

function FactCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="flat" className="h-full">
      <h3 className="font-display text-base font-semibold tracking-marquee text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">{children}</p>
    </Card>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="space-y-16 animate-fade-in sm:space-y-24">
      {/* Hero */}
      <section className="mx-auto max-w-3xl text-center">
        <span className="eyebrow">How it works</span>
        <h1 className="text-gold-gradient mt-3 font-display text-4xl font-bold leading-[1.05] tracking-marquee sm:text-6xl">
          One trading day, one settle, one dollar.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-ink-dim sm:text-base">
          Meridian is a daily prediction market on the seven largest US tech
          stocks. Each morning it opens a fresh set of yes-or-no markets — “will
          this stock close at or above this price today?” — and settles them the
          moment the market closes. Every contract pays exactly $1 if it wins and
          nothing if it loses. The whole thing runs on{' '}
          <a
            href="https://bitbadges.io"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-gold-bright transition-colors hover:text-gold"
          >
            BitBadges
          </a>
          , a chain whose token standard already speaks prediction markets
          natively — so almost none of this logic is custom code.
        </p>
      </section>

      {/* Lifecycle */}
      <section>
        <SectionHeader kicker="The trading day" n="01" />
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-ink-dim">
          Every market lives for a single US trading day. Two scheduled jobs
          bookend it — one to open the markets in the morning, one to settle them
          in the afternoon. Both jobs check an NYSE calendar first, so nothing
          runs on weekends or holidays.
        </p>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LIFECYCLE.map((s, i) => (
            <li key={s.label}>
              <Card variant="raised" accent="gold" className="h-full">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold">
                    {s.time}
                  </span>
                  <span className="font-mono text-[10px] text-faint">{i + 1}/4</span>
                </div>
                <h3 className="mt-2 font-display text-xl font-semibold tracking-marquee text-ink">
                  {s.label}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Built on BitBadges */}
      <section>
        <SectionHeader kicker="Built on BitBadges" n="02" />
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-ink-dim">
          Most prediction-market projects start by writing the core financial
          logic from scratch. We didn’t have to. BitBadges ships a prediction
          market as a built-in token type, so the rules that matter most are
          enforced by the chain itself rather than by our app.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FactCard title="Paired YES / NO tokens">
            Each market mints two complementary tokens. One of them is always the
            winner, and the chain guarantees a winning token is redeemable for
            exactly $1 — that invariant lives in protocol code, not ours.
          </FactCard>
          <FactCard title="Verifier-vote settlement">
            A single designated address settles each market by casting an on-chain
            vote (<Code>MsgCastVote</Code>). The chain enforces that only that
            address can decide that market — no custom permission logic needed.
          </FactCard>
          <FactCard title="Fast, final blocks">
            Roughly 1.5-second block times. For markets that trade all day and
            settle once at close, that’s far faster than the product needs.
          </FactCard>
        </div>
      </section>

      {/* Order book */}
      <section>
        <SectionHeader kicker="The order book" n="03" />
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-ink-dim">
          There is no off-chain matching engine. Every limit order is just an
          on-chain permission slip — an <Code>approval</Code> — that says “I’ll
          give X to receive Y.” A trade is a single transfer that references two
          of these slips at once and runs them together atomically. Anyone can
          submit the transfer that crosses two orders.
        </p>
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <FactCard title="A liquidity bot seeds every market">
            The moment a market is created, a bot deposits funds, mints YES and
            NO inventory, and posts a full ladder of orders at different prices
            and sizes — so a brand-new market already feels like a live exchange.
          </FactCard>
          <FactCard title="No partial fills">
            Each order is exact-quantity. To make common order sizes fillable, the
            seeder posts a ladder of quantities (1, 5, and 10 tokens) at each
            price rather than one big block.
          </FactCard>
        </div>
        <h3 className="mb-3 font-display text-lg font-semibold tracking-marquee text-ink">
          An always-on bot is the de-facto matching engine
        </h3>
        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-ink-dim">
          Every block, an arbitrage bot scans all markets for three mispricings
          and trades them away. This is what keeps prices honest and orders
          getting filled even when two humans aren’t on opposite sides.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {ARB_PATTERNS.map((p) => (
            <FactCard key={p.title} title={p.title}>
              {p.body}
            </FactCard>
          ))}
        </div>
      </section>

      {/* Oracle */}
      <section>
        <SectionHeader kicker="The price oracle" n="04" />
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-ink-dim">
          Settlement is only as trustworthy as the closing price behind it. So
          the oracle never settles on a single number. It reads three independent
          public price feeds — two from Yahoo Finance (different servers for
          redundancy) and one from Stooq — and settles on the{' '}
          <span className="text-ink">median</span> of them. Before it writes
          anything on-chain, the reading has to clear three guards.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <FactCard title="Enough sources">
            If fewer than two feeds answer, settlement is refused — a lone reading
            can’t be cross-checked against anything.
          </FactCard>
          <FactCard title="Agreement">
            If the feeds disagree by more than 1%, settlement halts with the
            per-source readings logged, rather than locking in a number while
            sources are fighting.
          </FactCard>
          <FactCard title="Session closed">
            A market only settles once every feed agrees the trading session has
            actually closed. If not, that name is deferred and retried — never
            settled against a mid-session tick.
          </FactCard>
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-dim">
          The winning outcome is then posted as a signed on-chain vote, so anyone
          can reproduce the price lookups for a given day and audit the result.
          For production, the chain natively supports requiring several
          independent verifiers to agree before a market settles — a
          configuration change, not new code.
        </p>
      </section>

      {/* Architecture */}
      <section>
        <SectionHeader kicker="The supporting cast" n="05" />
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-ink-dim">
          The chain holds the money and the rules. Everything else is a thin
          layer on top to make it pleasant to use.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FactCard title="A lightweight indexer">
            A small service reads the chain and serves the views it doesn’t index
            natively — the list of open markets, price history charts, and the
            full order book for each market.
          </FactCard>
          <FactCard title="Live updates, no refresh">
            The app subscribes to a single realtime channel, so prices, orders,
            and your positions update the instant the chain changes — no polling,
            no manual reload.
          </FactCard>
          <FactCard title="Your own wallet">
            Connect directly with Keplr or MetaMask. There’s no custodian and no
            sign-up — you trade from keys you control.
          </FactCard>
        </div>
      </section>

      {/* Honest limitations */}
      <section>
        <SectionHeader kicker="Where the edges are" n="06" />
        <Card variant="hero" className="bg-hero-radial">
          <p className="max-w-2xl text-sm leading-relaxed text-ink-dim">
            This is a demo on a test network — no real money is at stake, and it
            runs on a single server with a single settlement key. The closing
            price comes from public feeds that share upstream data, so a
            market-wide bad print could still slip through. None of this is
            investment, legal, or tax advice. Those trade-offs, and how a
            production deployment would close them, are written up in full in the
            project’s risk notes.
          </p>
        </Card>
      </section>

      {/* CTA */}
      <section className="flex flex-col items-center gap-4 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-marquee text-ink sm:text-3xl">
          See it live
        </h2>
        <p className="max-w-md text-sm text-ink-dim">
          Browse today’s markets and place your first prediction.
        </p>
        <Link
          href="/markets"
          className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-bg shadow-clay-sm transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
        >
          Browse markets →
        </Link>
      </section>
    </div>
  );
}
