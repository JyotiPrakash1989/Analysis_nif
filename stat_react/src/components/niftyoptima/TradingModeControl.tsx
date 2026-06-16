type Props = {
  autoTrading: boolean;
  syncing?: boolean;
  onChange: (auto: boolean) => void;
  minDailyScore: number;
  onMinDailyScoreChange: (score: number) => void;
};

export function TradingModeControl({
  autoTrading,
  syncing,
  onChange,
  minDailyScore,
  onMinDailyScoreChange,
}: Props) {
  return (
    <div className="rounded-lg border border-nox-line bg-nox-bg/80 p-3 space-y-3">
      <p className="text-xs font-semibold text-white uppercase tracking-wide">Order mode</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => onChange(false)}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            !autoTrading
              ? 'bg-cyan-500 text-black'
              : 'bg-nox-surface border border-nox-line text-nox-muted hover:text-white'
          }`}
        >
          Manual
        </button>
        <button
          type="button"
          disabled={syncing}
          onClick={() => onChange(true)}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            autoTrading
              ? 'bg-emerald-500 text-black'
              : 'bg-nox-surface border border-nox-line text-nox-muted hover:text-white'
          }`}
        >
          Auto
        </button>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="nifty-min-score" className="text-[11px] text-nox-muted">
            Min strategy score
          </label>
          <span className="text-xs font-mono text-amber-300 tabular-nums">{minDailyScore}%</span>
        </div>
        <input
          id="nifty-min-score"
          type="range"
          min={50}
          max={100}
          step={1}
          disabled={syncing}
          value={minDailyScore}
          onChange={(e) => onMinDailyScoreChange(Number(e.target.value))}
          className="w-full accent-cyan-500 disabled:opacity-50"
        />
        <div className="flex items-center justify-between text-[10px] text-nox-muted tabular-nums">
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>
      <p className="text-[11px] text-nox-muted leading-relaxed">
        {autoTrading
          ? `Auto: places buy when CE or PE scores ≥ ${minDailyScore}%. Exits when LTP ≥ target or LTP ≤ stop-loss.`
          : `Manual: tap Buy when score ≥ ${minDailyScore}%. Target and stop-loss exits run automatically on LTP.`}
      </p>
    </div>
  );
}
