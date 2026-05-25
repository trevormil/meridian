import type { ReactNode } from 'react';

/**
 * Prediction-market-focused BitBadges CLI walkthrough, rendered as a terminal.
 * `bb` and the prediction-market verbs are highlighted gold; everything else
 * stays dim so the eye lands on the subset that matters. Purely presentational
 * (no hooks) so it can drop into both server and client pages.
 */

function Cmt({ children }: { children: ReactNode }) {
  return <div className="text-muted">{`# `}{children}</div>;
}

function Cmd({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="select-none text-gold-bright">$</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}

// Claude Code slash command (not a shell line).
function Slash({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="select-none text-yes-bright">›</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}

const bb = <span className="font-semibold text-gold-bright">bb</span>;
const pm = <span className="text-gold-bright/90">prediction-markets</span>;

export function CliTerminal() {
  return (
    <div className="overflow-hidden rounded-clay border border-border-hi bg-panel-2 shadow-clay ring-1 ring-gold/15">
      <div className="flex items-center gap-2 border-b border-border-hi bg-gold/[0.08] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-no" />
        <span className="h-2.5 w-2.5 rounded-full bg-gold" />
        <span className="h-2.5 w-2.5 rounded-full bg-yes" />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.16em] text-gold-bright/80">bitbadges cli · prediction markets</span>
      </div>
      <div className="overflow-x-auto px-4 py-4 font-mono text-[12px] leading-relaxed sm:text-[13px]">
        <div className="w-max min-w-full space-y-3">
          <div className="space-y-0.5">
            <Cmt>Install the CLI</Cmt>
            <Cmd>curl -fsSL https://install.bitbadges.io | sh</Cmd>
          </div>
          <div className="space-y-0.5">
            <Cmt>…and drive it from Claude Code</Cmt>
            <Slash>/plugin marketplace add BitBadges/bitbadges-plugin</Slash>
            <Slash>/plugin install bitbadges</Slash>
          </div>
          <div className="space-y-0.5">
            <Cmt>Create a wallet key to sign with</Cmt>
            <Cmd>{bb} keys add mywallet</Cmd>
            <Cmd>{bb} keys list</Cmd>
          </div>
          <div className="space-y-0.5">
            <Cmt>Create a market — seven approvals, one command</Cmt>
            <Cmd>{bb} build prediction-market --verifier bb1resolver…xyz --denom USDC | {bb} deploy</Cmd>
          </div>
          <div className="space-y-0.5">
            <Cmt>Trade YES / NO on market #55</Cmt>
            <Cmd>{bb} {pm} buy-yes 55 --creator bb1trader…xyz --token-amount 100 --payment-amount 40 --denom USDC | {bb} deploy</Cmd>
            <Cmd>{bb} {pm} sell-no 55 --creator bb1trader…xyz --token-amount 50 --payment-amount 30 --denom USDC | {bb} deploy</Cmd>
          </div>
          <div className="space-y-0.5">
            <Cmt>Resolve, then redeem winnings</Cmt>
            <Cmd>{bb} {pm} resolve 55 --creator bb1resolver…xyz --outcome yes | {bb} deploy</Cmd>
            <Cmd>{bb} {pm} redeem 55 --creator bb1trader…xyz --state yes-wins | {bb} deploy</Cmd>
          </div>
          <div className="space-y-0.5">
            <Cmt>Browse + inspect markets anytime</Cmt>
            <Cmd>{bb} {pm} list --open</Cmd>
            <Cmd>{bb} {pm} status 55</Cmd>
          </div>
        </div>
      </div>
    </div>
  );
}
