import { useMemo, useRef } from 'react';
import type { NiftyDaySuggestion } from '../../hooks/useDaySuggestions';
import { DEFAULT_MIN_DAILY_SCORE } from '../../lib/tradingMode';
import {
  formatPremium,
  legLtpFromChain,
  resolveFixedStrategyLevels,
  suggestionToSignal,
} from '../../lib/signalLevels';
import type { OptionChainRow, SignalPayload } from '../../types/niftyoptima';

function currentValueClass(
  optionType: 'CE' | 'PE',
  currentLtp: number | null,
  entry: number
): string {
  if (currentLtp == null) return 'text-nox-muted';
  const ref = Number(entry);
  if (Number.isFinite(ref) && ref > 0) {
    if (currentLtp > ref) return 'text-emerald-400 font-semibold';
    if (currentLtp < ref) return 'text-rose-400 font-semibold';
  }
  return optionType === 'CE' ? 'text-emerald-400' : 'text-rose-400';
}

type Props = {
  suggestions: NiftyDaySuggestion[];
  day?: string;
  loading?: boolean;
  optionChain?: OptionChainRow[];
  onBuy?: (sig: SignalPayload, suggestionId: string) => void;
  buyingId?: string | null;
  buyDisabled?: boolean;
  minDailyScore?: number;
};

export function NiftyDaySuggestions({
  suggestions,
  day,
  loading,
  optionChain = [],
  onBuy,
  buyingId = null,
  buyDisabled = false,
  minDailyScore = DEFAULT_MIN_DAILY_SCORE,
}: Props) {
  const frozenStrategies = useRef(new Map<string, SignalPayload>());

  const rows = useMemo(() => {
    const sorted = [...suggestions].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return sorted.map((r) => {
      const currentLtp = legLtpFromChain(Number(r.strike), r.optionType, optionChain);
      let strategy = frozenStrategies.current.get(r.id);
      if (!strategy) {
        strategy = resolveFixedStrategyLevels(suggestionToSignal(r), optionChain);
        if (optionChain.length > 0 || strategy.entry > 0) {
          frozenStrategies.current.set(r.id, strategy);
        }
      } else if (optionChain.length > 0) {
        const upgraded = resolveFixedStrategyLevels(suggestionToSignal(r), optionChain);
        if (upgraded.entry !== strategy.entry || upgraded.sl !== strategy.sl) {
          frozenStrategies.current.set(r.id, upgraded);
          strategy = upgraded;
        }
      }
      return { ...r, strategy, currentLtp };
    });
  }, [suggestions, optionChain]);

  return (
    <section className="rounded-xl border border-sky-500/30 bg-nox-surface/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-sky-500/20 bg-sky-500/5">
        <h2 className="text-sm font-semibold text-sky-300">Today&apos;s NIFTY suggestions</h2>
        <p className="text-[11px] text-nox-muted mt-0.5">
          Only setups scored ≥{minDailyScore}% — entry / SL / target fixed at signal; current is live LTP
        </p>
      </div>
      {loading && rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-nox-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-nox-muted">No NIFTY suggestions logged yet today.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-nox-muted text-left bg-nox-bg/50">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Leg</th>
                <th className="px-3 py-2">Strike</th>
                <th className="px-3 py-2">Current</th>
                <th className="px-3 py-2">Entry</th>
                <th className="px-3 py-2">SL</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Buy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ce = r.optionType === 'CE';
                const buying = buyingId === r.id;
                const canBuy =
                  Boolean(onBuy) &&
                  !buyDisabled &&
                  r.status !== 'suppressed' &&
                  !buyingId;
                const currentClass = currentValueClass(
                  r.optionType,
                  r.currentLtp,
                  r.strategy.entry
                );
                return (
                  <tr key={r.id} className="border-t border-nox-line/50 align-middle">
                    <td className="px-3 py-2 text-nox-muted whitespace-nowrap">
                      {new Date(r.ts).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.signalIndex ?? '—'}</td>
                    <td className={`px-3 py-2 font-semibold ${ce ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {r.optionType}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.strike}</td>
                    <td
                      className={`px-3 py-2 tabular-nums ${currentClass}`}
                      title="Live CE/PE premium vs strategy entry"
                    >
                      {formatPremium(r.currentLtp)}
                    </td>
                    <td className="px-3 py-2 tabular-nums" title="Strategy entry premium when signal fired">
                      {formatPremium(r.strategy.entry)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-rose-300">{formatPremium(r.strategy.sl)}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-300">{formatPremium(r.strategy.tgt)}</td>
                    <td className="px-3 py-2 tabular-nums text-amber-300">
                      {r.confidence != null ? `${r.confidence}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-nox-muted capitalize">{r.status ?? 'active'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {onBuy ? (
                        <button
                          type="button"
                          disabled={!canBuy}
                          onClick={() => onBuy(r.strategy, r.id)}
                          className="rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold px-2.5 py-1 text-[11px] transition-colors"
                          title={
                            r.status === 'suppressed'
                              ? 'Setup was suppressed while a position was open'
                              : buyDisabled
                                ? 'Finish the current order first'
                                : 'Place manual buy at strategy entry / SL / target'
                          }
                        >
                          {buying ? 'Buying…' : 'Buy'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
