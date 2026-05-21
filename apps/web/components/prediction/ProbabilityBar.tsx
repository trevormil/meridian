interface Props {
  yesPrice: number;
  noPrice: number;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
}

const sizes = {
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
};

/**
 * Probability bar — split between YES (champagne) and NO (crimson). Sharp
 * rectangular slabs (NOT pill-rounded) and a single hairline divider between
 * them. The gradient + inner shadow on each side give the bar dimensional
 * weight without resorting to outlines.
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
        className={`relative flex w-full overflow-hidden rounded-sm border border-border bg-bg-deep ${sizes[size]}`}
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
