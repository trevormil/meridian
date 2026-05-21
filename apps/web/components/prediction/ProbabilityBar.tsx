interface Props {
  yesPrice: number;
  noPrice: number;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
}

const sizes = {
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-5',
};

export function ProbabilityBar({ yesPrice, noPrice, size = 'md', showLabels = true }: Props) {
  const total = yesPrice + noPrice;
  const yesShare = total > 0 ? yesPrice / total : 0.5;
  const noShare = 1 - yesShare;
  return (
    <div className="space-y-1.5">
      {showLabels && (
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-yes">YES {(yesShare * 100).toFixed(1)}%</span>
          <span className="text-no">{(noShare * 100).toFixed(1)}% NO</span>
        </div>
      )}
      <div className={`flex w-full overflow-hidden rounded-full bg-border ${sizes[size]}`}>
        <div
          className="bg-yes shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
          style={{ width: `${yesShare * 100}%`, transition: 'width 300ms ease-out' }}
        />
        <div
          className="bg-no shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
          style={{ width: `${noShare * 100}%`, transition: 'width 300ms ease-out' }}
        />
      </div>
    </div>
  );
}
