import { useEffect, useState } from 'react';
import { buyLevelsForStock } from '../../hooks/useEquityBuy';
import type { EquityDaySuggestion } from '../../hooks/useDaySuggestions';
import type { SuggestFilters } from '../../lib/filterSuggestedStocks';
import type { EquityScanMeta, RankedStock, StockSnapshot } from '../../types/equityStrategy';

type Props = {
  ranked: RankedStock[];
  topPick: RankedStock | null;
  allStocks: StockSnapshot[];
  filters: SuggestFilters;
  onFiltersChange: (patch: Partial<SuggestFilters>) => void;
  filtersSyncing?: boolean;
  loading?: boolean;
  onBuy: (stock: StockSnapshot) => void;
  buyingSymbol?: string | null;
  daySuggestions?: EquityDaySuggestion[];
  sessionDay?: string;
  daySuggestionsLoading?: boolean;
  scanMeta?: EquityScanMeta | null;
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function SuggestedStocksSection({
  ranked,
  topPick,
  allStocks,
  filters,
  onFiltersChange,
  filtersSyncing,
  loading,
  onBuy,
  buyingSymbol,
  daySuggestions = [],
  sessionDay,
  daySuggestionsLoading,
  scanMeta,
}: Props) {
  const [confidenceInput, setConfidenceInput] = useState(String(filters.minConfidence));
  const [targetInput, setTargetInput] = useState(String(filters.minTargetPct));

  useEffect(() => {
    setConfidenceInput(String(filters.minConfidence));
    setTargetInput(String(filters.minTargetPct));
  }, [filters.minConfidence, filters.minTargetPct]);

  const waitingCount = allStocks.filter(
    (s) => !ranked.some((r) => r.symbol === s.symbol)
  ).length;
  const rankedSymbols = new Set(ranked.map((s) => s.symbol));
  const dayRows = [...daySuggestions]
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .filter((r, i, arr) => arr.findIndex((x) => x.symbol === r.symbol) === i)
    .filter((r) => !rankedSymbols.has(r.symbol));
  const dayLabel = sessionDay || daySuggestions[0]?.dayKey || 'this session';

  function applyConfidence() {
    const n = Math.round(Number(confidenceInput));
    if (!Number.isFinite(n)) {
      setConfidenceInput(String(filters.minConfidence));
      return;
    }
    onFiltersChange({ minConfidence: n });
  }

  function applyTarget() {
    const n = Number(targetInput);
    if (!Number.isFinite(n)) {
      setTargetInput(String(filters.minTargetPct));
      return;
    }
    onFiltersChange({ minTargetPct: n });
  }

  return (
    <section className="rounded-xl border border-emerald-500/30 bg-nox-surface/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-emerald-500/20 bg-emerald-500/5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-emerald-400">Suggested stocks — your list only</h2>
          <p className="text-xs text-nox-muted mt-0.5">
            Intraday buys from added stocks · EMA trend + 15m breakout + liquidity + NIFTY RS.
            {scanMeta ? (
              <>
                {' '}
                {scanMeta.watchlistSize} stock{scanMeta.watchlistSize === 1 ? '' : 's'} in list
                {scanMeta.niftyChangePct != null
                  ? ` · NIFTY ${scanMeta.niftyChangePct >= 0 ? '+' : ''}${scanMeta.niftyChangePct.toFixed(2)}%`
                  : ''}
                {scanMeta.beforeOpeningRange ? ' · signals from 9:30 AM IST' : ''}.
              </>
            ) : null}{' '}
            Filters: {filters.minConfidence}%+ confidence, {filters.minTargetPct}%+ target.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 shrink-0">
          <label className="text-[11px] text-nox-muted">
            Min confidence %
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={confidenceInput}
              onChange={(e) => setConfidenceInput(e.target.value)}
              onBlur={() => applyConfidence()}
              onKeyDown={(e) => e.key === 'Enter' && applyConfidence()}
              className="mt-1 block w-24 rounded-lg border border-nox-line bg-nox-bg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
            />
          </label>
          <label className="text-[11px] text-nox-muted">
            Min target %
            <input
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              onBlur={() => applyTarget()}
              onKeyDown={(e) => e.key === 'Enter' && applyTarget()}
              className="mt-1 block w-24 rounded-lg border border-nox-line bg-nox-bg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
            />
          </label>
          {loading || filtersSyncing ? (
            <span className="text-xs text-nox-muted animate-pulse pb-1.5">Updating…</span>
          ) : null}
        </div>
      </div>

      {topPick ? (
        <div className="px-4 py-3 border-b border-emerald-500/15 bg-emerald-500/[0.08]">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">Top pick</p>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="text-lg font-semibold text-white">{topPick.symbol}</span>
            <span className="text-nox-muted">
              LTP <span className="text-white font-medium">{fmt(topPick.ltp)}</span>
            </span>
            <span className="text-nox-muted">
              Purchase{' '}
              <span className="text-sky-300 font-semibold">{fmt(topPick.analysis.entry)}</span>
            </span>
            <span className="text-nox-muted">
              Target <span className="text-emerald-400 font-semibold">{fmt(topPick.analysis.tgt)}</span>
            </span>
            <span className="text-nox-muted">
              Stop loss <span className="text-rose-400 font-semibold">{fmt(topPick.analysis.sl)}</span>
            </span>
            {topPick.rewardPct != null ? (
              <span className="text-emerald-400 text-xs font-medium">
                Target +{fmt(topPick.rewardPct, 2)}%
              </span>
            ) : null}
            <span className="text-amber-300 text-xs">{topPick.analysis.confidence}% confidence</span>
            {topPick.analysis.qualityGrade ? (
              <span className="text-emerald-300 text-xs font-medium">Grade {topPick.analysis.qualityGrade}</span>
            ) : null}
            {topPick.analysis.relativeStrength != null ? (
              <span className="text-sky-300 text-xs">RS vs NIFTY +{fmt(topPick.analysis.relativeStrength, 2)}%</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {ranked.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-amber-200/90">
            No buy suggestions with {filters.minConfidence}%+ confidence
          </p>
          <p className="text-xs text-nox-muted mt-1">
            {scanMeta?.beforeOpeningRange
              ? 'Scanner is warming up — buy signals unlock after 9:30 AM IST once the opening range forms.'
              : allStocks.length
                ? `${waitingCount} stock${waitingCount === 1 ? '' : 's'} in your list — try lower min confidence or target, or wait for breakout + trend`
                : 'Add stocks below, then intraday buy suggestions will appear here'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-nox-muted border-b border-emerald-500/15 bg-emerald-500/[0.04]">
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Stock</th>
                <th className="px-4 py-2.5 font-medium">LTP</th>
                <th className="px-4 py-2.5 font-medium text-emerald-400/90">Target %</th>
                <th className="px-4 py-2.5 font-medium text-sky-300">Purchase price</th>
                <th className="px-4 py-2.5 font-medium text-emerald-400">Target</th>
                <th className="px-4 py-2.5 font-medium text-rose-400">Stop loss</th>
                <th className="px-4 py-2.5 font-medium text-cyan-400">Support</th>
                <th className="px-4 py-2.5 font-medium text-violet-400">Resistance</th>
                <th className="px-4 py-2.5 font-medium">Confidence</th>
                <th className="px-4 py-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((stock, i) => {
                const a = stock.analysis;
                const levels = buyLevelsForStock(stock);
                const purchase = levels?.entry ?? a.entry;
                const target = levels?.tgt ?? a.tgt;
                const sl = levels?.sl ?? a.sl;
                const buying = buyingSymbol === stock.symbol;
                const canBuy =
                  stock.ltp > 0 && levels != null && a.suggestPurchase && a.side === 'BUY';
                const targetPct =
                  stock.rewardPct ??
                  (a.entry && a.tgt ? ((a.tgt - a.entry) / a.entry) * 100 : null);

                return (
                  <tr
                    key={stock.symbol}
                    className="border-b border-nox-line/50 hover:bg-emerald-500/[0.03] align-middle"
                  >
                    <td className="px-4 py-3 text-amber-400 font-bold tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{stock.symbol}</p>
                      {stock.name && stock.name !== stock.symbol ? (
                        <p className="text-[10px] text-nox-muted truncate max-w-[120px]">{stock.name}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-white">{fmt(stock.ltp)}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-emerald-400">
                      {targetPct == null ? '—' : `+${fmt(targetPct, 2)}%`}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-sky-300 font-semibold">{fmt(purchase)}</td>
                    <td className="px-4 py-3 tabular-nums text-emerald-400 font-semibold">{fmt(target)}</td>
                    <td className="px-4 py-3 tabular-nums text-rose-400 font-semibold">{fmt(sl)}</td>
                    <td className="px-4 py-3 tabular-nums text-cyan-300 font-medium">
                      {fmt(stock.supportResistance?.support ?? null)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-violet-300 font-medium">
                      {fmt(stock.supportResistance?.resistance ?? null)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-amber-300">
                      {a.confidence}%
                      {stock.rewardPct != null ? (
                        <span className="block text-[10px] text-nox-muted">+{fmt(stock.rewardPct, 1)}%</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={buying || !canBuy}
                        onClick={() => onBuy(stock)}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap"
                      >
                        {buying ? 'Placing…' : 'Buy now'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ranked.length > 0 ? (
        <div className="px-4 py-3 border-t border-nox-line/50 space-y-1.5 bg-nox-bg/30">
          <p className="text-[10px] uppercase tracking-wider text-nox-muted">Why suggested</p>
          {ranked.map((stock) => (
            <p key={stock.symbol} className="text-[11px] text-nox-muted">
              <span className="text-emerald-300 font-medium">{stock.symbol}:</span>{' '}
              {stock.analysis.factors.length
                ? stock.analysis.factors.join(' · ')
                : stock.analysis.rationale}
            </p>
          ))}
        </div>
      ) : null}

      {ranked.length > 0 && waitingCount > 0 ? (
        <p className="px-4 pb-3 text-[11px] text-nox-muted border-t border-nox-line/50 pt-2">
          {waitingCount} other stock{waitingCount === 1 ? '' : 's'} in your list do not meet your filters — see
          Your stock list below.
        </p>
      ) : null}

      <div className="border-t border-emerald-500/20 bg-violet-500/[0.04]">
        <div className="px-4 py-3 border-b border-violet-500/15">
          <h3 className="text-xs font-semibold text-violet-300">Today&apos;s stock suggestions</h3>
          <p className="text-[11px] text-nox-muted mt-0.5">
            Earlier signals for {dayLabel} — stocks still on the live list above are not repeated here
          </p>
        </div>
        {daySuggestionsLoading && dayRows.length === 0 ? (
          <p className="px-4 py-3 text-xs text-nox-muted">Loading…</p>
        ) : dayRows.length === 0 ? (
          <p className="px-4 py-3 text-xs text-nox-muted">
            {ranked.length > 0
              ? 'All logged suggestions are shown in the live list above.'
              : 'No stock suggestions logged yet today.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-nox-muted text-left bg-nox-bg/50">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">LTP</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">SL</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map((r) => (
                  <tr key={r.id} className="border-t border-nox-line/50">
                    <td className="px-3 py-2 text-nox-muted whitespace-nowrap">
                      {new Date(r.ts).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2 font-semibold text-white">{r.symbol}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(r.ltp)}</td>
                    <td className="px-3 py-2 tabular-nums text-sky-300">{fmt(r.entry)}</td>
                    <td className="px-3 py-2 tabular-nums text-rose-300">{fmt(r.sl)}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-300">{fmt(r.tgt)}</td>
                    <td className="px-3 py-2 tabular-nums text-amber-300">{r.confidence}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
