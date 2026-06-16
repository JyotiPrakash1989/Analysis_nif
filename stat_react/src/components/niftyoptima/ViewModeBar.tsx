import type { EquityProfitableHint } from '../../context/EquityAlertsContext';
import type { NiftyProfitableHint } from '../../context/NiftyAlertsContext';

export type ViewMode = 'nifty' | 'stocks' | 'history' | 'orders' | 'settings';

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  niftyHint?: NiftyProfitableHint | null;
  stockHint?: EquityProfitableHint | null;
};

const TABS: { id: ViewMode; label: string }[] = [
  { id: 'nifty', label: 'Nifty' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'orders', label: 'Orders' },
  { id: 'history', label: 'History (5D)' },
  { id: 'settings', label: 'Settings' },
];

function tabHint(id: ViewMode, niftyHint?: NiftyProfitableHint | null, stockHint?: EquityProfitableHint | null) {
  if (id === 'nifty' && niftyHint) {
    const score = niftyHint.confidence != null ? ` ${niftyHint.confidence}%` : '';
    return `${niftyHint.optionType}${score}`;
  }
  if (id === 'stocks' && stockHint) {
    return `${stockHint.symbol} +${stockHint.rewardPct.toFixed(1)}%`;
  }
  return null;
}

export function ViewModeBar({ mode, onChange, niftyHint, stockHint }: Props) {
  return (
    <div
      className="sticky top-0 z-20 border-b border-nox-line bg-nox-surface/95 backdrop-blur px-4 py-2 space-y-2"
      role="tablist"
      aria-label="View mode"
    >
      <div className="max-w-6xl mx-auto flex gap-2">
        {TABS.map((tab) => {
          const hint = tabHint(tab.id, niftyHint, stockHint);
          const ready = Boolean(hint);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === tab.id
                  ? 'bg-sky-500/20 text-white ring-1 ring-sky-400/60'
                  : ready
                    ? 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-500/15'
                    : 'bg-nox-bg text-nox-muted hover:text-white'
              }`}
              onClick={() => onChange(tab.id)}
            >
              <span className="block truncate">{tab.label}</span>
              {hint ? (
                <span className="block text-[10px] font-semibold text-emerald-300 truncate mt-0.5">
                  {hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {(niftyHint || stockHint) && mode !== 'nifty' && mode !== 'stocks' ? (
        <p className="max-w-6xl mx-auto text-[11px] text-emerald-300/90 px-1">
          {niftyHint && stockHint
            ? `Profitable setups ready — NIFTY ${niftyHint.optionType} (${niftyHint.confidence ?? '—'}%) · ${stockHint.symbol} (+${stockHint.rewardPct.toFixed(1)}%)`
            : niftyHint
              ? `NIFTY ${niftyHint.optionType} strategy ready (${niftyHint.confidence ?? '—'}% score)`
              : stockHint
                ? `Stock buy ready: ${stockHint.symbol} (+${stockHint.rewardPct.toFixed(1)}% target)`
                : null}
        </p>
      ) : null}
    </div>
  );
}
