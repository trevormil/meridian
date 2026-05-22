interface Props {
  yesPrice: number;
  noPrice: number;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
}

const sizes = {
  sm: 'h-2',
  md: 'h-2.5',
  lg: 'h-3.5',
};

/**
 * Probability bar — split between YES (green) and NO (red). Clay treatment:
 * a fully-rounded pill recessed into the surface (inset shadow), with each
 * fill capped soft and a glossy top highlight for dimensional weight.
 */
export function ProbabilityBar({ yesPrice, noPrice, size = 'md', showLabels = false }: Props) {
  const total = yesPrice + noPrice;
  const yesShare = total > 0 ? yesPrice / total : 0.5;
  const noShare = 1 - yesShare;
  return (
    <div className="space-y-1.5">
      {showLabels && (
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className="text-yes">YES · {(yesShare * 100).toFixed(1)}%</span>
          <span className="text-no">{(noShare * 100).toFixed(1)}% · NO</span>
        </div>
      )}
      <div
        className={`relative flex w-full overflow-hidden rounded-full bg-bg-deep shadow-clay-inset ${sizes[size]}`}
      >
        <div
          className="bg-gradient-to-r from-yes/80 to-yes-bright shadow-[inset_0_1px_0_rgba(245,239,223,0.18)] transition-[width] duration-500 ease-out"
          style={{ width: `${yesShare * 100}%` }}
        />
        <div
          className="bg-gradient-to-r from-no to-no/80 shadow-[inset_0_1px_0_rgba(245,239,223,0.18)] transition-[width] duration-500 ease-out"
          style={{ width: `${noShare * 100}%` }}
        />
      </div>
    </div>
  );
}
