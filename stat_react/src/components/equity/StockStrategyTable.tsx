import type { RankedStock, StockSnapshot } from '../../types/equityStrategy';

type Props = {
  stocks: StockSnapshot[];
  ranked: RankedStock[];
  topPick: RankedStock | null;
  message?: string;
  loading?: boolean;
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function buyTone(suggest: boolean) {
  return suggest
    ? 'text-emerald-400 bg-emerald-500/10 ring-emerald-400/40'
    : 'text-nox-muted bg-nox-bg ring-nox-line';
}

/** Full watchlist rows with buy suggestions sorted to top. */
function orderRows(stocks: StockSnapshot[], ranked: RankedStock[]) {
  const buySymbols = new Set(ranked.map((r) => r.symbol));
  const buyRows = ranked;
  const waitRows = stocks.filter((s) => !buySymbols.has(s.symbol));
  return [...buyRows, ...waitRows];
}

export function StockStrategyTable({ stocks, ranked, topPick, message, loading }: Props) {
  const display = orderRows(stocks, ranked);

  if (!stocks.length) {
    return null;
  }

  return (
    <section className="rounded-xl border border-nox-line bg-nox-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-nox-line flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">High-confluence purchase analysis</h2>
          <p className="text-xs text-nox-muted">
            Requires EMA trend + 15m breakout together — only top-ranked profitable picks shown
          </p>
        </div>
        {loading ? <span className="text-xs text-nox-muted animate-pulse">Analyzing…</span> : null}
      </div>

      {message ? (
        <div className="px-4 py-2 border-b border-nox-line text-xs text-nox-muted">{message}</div>
      ) : null}

      {topPick ? (
        <div className="px-4 py-3 bg-emerald-500/5 border-b border-nox-line">
          <p className="text-xs uppercase tracking-wider text-emerald-400 mb-1">Best intraday buy from your list</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-lg font-semibold text-white">{topPick.symbol}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ring-1 ${buyTone(true)}`}>BUY</span>
            <span className="text-sm text-nox-muted">
              Purchase @ <span className="text-white font-medium">{fmt(topPick.analysis.entry)}</span>
              {' · '}
              Target <span className="text-emerald-400 font-medium">{fmt(topPick.analysis.tgt)}</span>
              {' · '}
              Stop loss <span className="text-rose-400 font-medium">{fmt(topPick.analysis.sl)}</span>
            </span>
            <span className="text-xs text-amber-300">
              Confidence {topPick.analysis.confidence}% · +{fmt(topPick.rewardPct, 1)}% to target
            </span>
          </div>
          <p className="text-xs text-nox-muted mt-1">{topPick.analysis.rationale}</p>
        </div>
      ) : (
        <div className="px-4 py-3 bg-amber-500/5 border-b border-nox-line text-xs text-amber-200">
          No high-confluence buy in your list — wait for EMA trend + 15m breakout with volume confirmation.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-nox-muted border-b border-nox-line">
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Stock</th>
              <th className="px-4 py-2 font-medium">LTP</th>
              <th className="px-4 py-2 font-medium">Suggestion</th>
              <th className="px-4 py-2 font-medium">Purchase price</th>
              <th className="px-4 py-2 font-medium">Target</th>
              <th className="px-4 py-2 font-medium">Stop loss</th>
              <th className="px-4 py-2 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => {
              const a = row.analysis;
              const suggest = a.suggestPurchase && a.side === 'BUY';
              return (
                <tr
                  key={row.symbol}
                  className={`border-b border-nox-line/60 hover:bg-nox-bg/50 ${suggest ? 'bg-emerald-500/[0.03]' : ''}`}
                >
                  <td className="px-4 py-2.5 text-nox-muted tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-white">{row.symbol}</td>
                  <td className="px-4 py-2.5 tabular-nums text-white">{fmt(row.ltp)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ring-1 ${buyTone(suggest)}`}>
                      {suggest ? 'BUY' : 'Wait'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-sky-300">{suggest ? fmt(a.entry) : '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums text-emerald-400">{suggest ? fmt(a.tgt) : '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums text-rose-400">{suggest ? fmt(a.sl) : '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums text-amber-300">
                    {suggest ? `${a.confidence}%` : fmt(a.score, 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {display.some((s) => s.analysis.factors.length > 0) ? (
        <div className="px-4 py-3 border-t border-nox-line space-y-2">
          <p className="text-xs uppercase tracking-wider text-nox-muted">Why buy / why wait</p>
          {display
            .filter((s) => s.analysis.factors.length > 0 || s.analysis.rationale)
            .map((s) => (
              <p key={s.symbol} className="text-xs text-nox-muted">
                <span className="text-white font-medium">{s.symbol}:</span>{' '}
                {s.analysis.factors.length
                  ? s.analysis.factors.join(' · ')
                  : s.analysis.rationale}
              </p>
            ))}
        </div>
      ) : null}
    </section>
  );
}
