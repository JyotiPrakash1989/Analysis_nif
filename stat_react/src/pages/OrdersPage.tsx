import { useEffect, useMemo, useRef, useState } from 'react';
import { exportOrdersExcelUrl, useOrderLog } from '../hooks/useOrderLog';
import { useEquityOrderLtps } from '../hooks/useEquityOrderLtps';
import { useLiveNiftySpot } from '../hooks/useLiveNiftySpot';
import { useNiftySocket } from '../hooks/useNiftySocket';
import { useOptionChainForSpot } from '../hooks/useOptionChainForSpot';
import { useOrderListExitVoice } from '../hooks/useOrderListExitVoice';
import { useOrderListVoiceAlerts } from '../hooks/useOrderListVoiceAlerts';
import type { OrderLogEntry } from '../types/niftyoptima';
import {
  applyEquityLiveLtpToRows,
  applyLiveLtpToRows,
  buildExitByBuyId,
  formatOrderLtp,
  liveExitOutcome,
  orderLogsToRows,
  outcomeFromLog,
  summarizeDayLogs,
} from '../types/niftyoptima';
import { readVoiceAlertsEnabled } from '../lib/strategyVoice';
import { pickOptionChainSnapshot, resolveHeadlineSpot } from '../utils/optionChain';

function formatDayLabel(dayKey: string) {
  if (!dayKey) return '—';
  const d = new Date(`${dayKey}T12:00:00`);
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function actionClass(action: string): string {
  if (action === 'BUY') return 'text-emerald-400 font-semibold';
  if (action === 'SELL') return 'text-rose-400 font-semibold';
  return 'text-sky-300';
}

function outcomeClass(outcome: string): string {
  if (outcome === 'Target achieved') return 'text-emerald-400 font-medium';
  if (outcome === 'Stop loss triggered') return 'text-rose-400 font-medium';
  if (outcome === 'Open' || outcome === 'Pending') return 'text-amber-300/90';
  if (outcome === 'Failed') return 'text-rose-300';
  return 'text-nox-muted';
}

function statusClass(status: string): string {
  if (status === 'failed') return 'text-rose-400';
  if (status === 'target_exit' || status === 'target_pending') return 'text-emerald-400';
  if (status === 'stoploss_exit' || status === 'stoploss_pending') return 'text-rose-300';
  if (['open', 'submitted', 'simulated'].includes(status)) return 'text-amber-300';
  return 'text-nox-muted';
}

type Props = {
  authTick: number;
};

export function OrdersPage({ authTick }: Props) {
  const [selectedDay, setSelectedDay] = useState('');
  const [voiceEnabled] = useState(readVoiceAlertsEnabled);
  const { logs, day: logDay, loading, appendFromSocket, refresh, clear } = useOrderLog(
    3000,
    selectedDay || undefined
  );
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const spotRest = useLiveNiftySpot(2500, authTick);
  const announceOrderRef = useRef<(row: OrderLogEntry) => void>(() => {});
  const { announceOrderLog } = useOrderListVoiceAlerts(voiceEnabled);
  announceOrderRef.current = announceOrderLog;

  const { tick } = useNiftySocket({
    onOrderLog: (row) => {
      appendFromSocket(row);
      announceOrderRef.current(row);
    },
  });

  useEffect(() => {
    if (!selectedDay && logDay) setSelectedDay(logDay);
  }, [logDay, selectedDay]);

  const displayDay = selectedDay || logDay;
  const summary = useMemo(() => summarizeDayLogs(logs), [logs]);

  const liveBars = tick?.bars1m?.length ? tick.bars1m : spotRest?.bars1m;
  const bars = liveBars?.length ? liveBars : (tick?.bars1m ?? []);
  const headlineSpot = resolveHeadlineSpot(spotRest, tick, bars);
  const chainForSpot = useOptionChainForSpot(headlineSpot, 2500, authTick);
  const { chain: fallbackChain } = pickOptionChainSnapshot(spotRest, tick, headlineSpot);
  const chain =
    chainForSpot?.chainSource === 'mstock' && chainForSpot.optionChain?.length
      ? chainForSpot.optionChain
      : chainForSpot?.optionChain?.length
        ? chainForSpot.optionChain
        : fallbackChain;

  const openEquitySymbols = useMemo(() => {
    const exitByBuyId = buildExitByBuyId(logs);
    return [
      ...new Set(
        logs
          .filter(
            (r) =>
              r.action === 'BUY' &&
              (r.assetType === 'equity' || r.optionType === 'EQ') &&
              outcomeFromLog(r, exitByBuyId) === 'Open'
          )
          .map((r) => String(r.equitySymbol || '').toUpperCase())
          .filter(Boolean)
      ),
    ];
  }, [logs]);

  const equityLtps = useEquityOrderLtps(openEquitySymbols, 5000);

  const tradeRows = useMemo(() => {
    const base = orderLogsToRows(logs);
    const withOptions = applyLiveLtpToRows(base, chain);
    return applyEquityLiveLtpToRows(withOptions, equityLtps);
  }, [logs, chain, equityLtps]);

  useOrderListExitVoice(voiceEnabled, tradeRows, chain);
  const exportUrl = exportOrdersExcelUrl(displayDay);

  async function handleClearSummary() {
    const ok = window.confirm(
      `Clear trade summary and full order log for ${formatDayLabel(displayDay)}? This cannot be undone.`
    );
    if (!ok) return;
    setClearing(true);
    setClearError(null);
    try {
      await clear(displayDay);
      await refresh();
    } catch (e) {
      setClearError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  }

  const allEntries = useMemo(
    () => [...logs].sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    [logs]
  );

  return (
    <div className="min-h-screen bg-nox-bg text-slate-100 flex flex-col">
      <header className="border-b border-nox-line bg-nox-surface/80 backdrop-blur px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-nox-muted">Full day order log</p>
            <p className="text-xl font-semibold text-white">{formatDayLabel(displayDay)}</p>
            <p className="text-[11px] text-nox-muted mt-1">
              All orders for the trading session · {summary.total} log entries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-nox-muted">
              Session date
              <input
                type="date"
                value={displayDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="mt-1 block rounded-lg border border-nox-line bg-nox-bg px-3 py-1.5 text-sm text-white"
              />
            </label>
            <a
              href={exportUrl}
              download
              className="rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors"
            >
              Export CSV
            </a>
            <button
              type="button"
              disabled={clearing || (summary.total === 0 && tradeRows.length === 0)}
              onClick={() => void handleClearSummary()}
              className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
            >
              {clearing ? 'Clearing…' : 'Clear summary'}
            </button>
          </div>
        </div>
        {clearError ? (
          <p className="max-w-6xl mx-auto mt-2 text-xs text-rose-400 px-4">{clearError}</p>
        ) : null}
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-3 py-4 space-y-4">
        <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { label: 'Buys', value: summary.buys },
            { label: 'Sells', value: summary.sells },
            { label: 'Updates', value: summary.updates },
            { label: 'Open', value: summary.open },
            { label: 'Targets', value: summary.targetHits },
            { label: 'Stop loss', value: summary.stopLossHits },
            { label: 'Auto / Manual', value: `${summary.auto} / ${summary.manual}` },
            {
              label: 'Realized P&L',
              value: `${summary.realizedPnl >= 0 ? '+' : ''}${summary.realizedPnl.toFixed(2)}`,
              color: summary.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400',
            },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-nox-line bg-nox-surface px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-nox-muted">{s.label}</p>
              <p className={`text-sm font-semibold tabular-nums ${s.color ?? 'text-white'}`}>{s.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-nox-line bg-nox-surface overflow-hidden">
          <div className="px-3 py-2 border-b border-nox-line flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">Trade summary</h2>
              <p className="text-[11px] text-nox-muted">Buy &amp; sell legs with P&amp;L and outcome</p>
            </div>
            <button
              type="button"
              disabled={clearing || (summary.total === 0 && tradeRows.length === 0)}
              onClick={() => void handleClearSummary()}
              className="rounded-lg border border-rose-500/40 px-2.5 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          {loading && tradeRows.length === 0 ? (
            <p className="p-4 text-sm text-nox-muted">Loading order log…</p>
          ) : tradeRows.length === 0 ? (
            <p className="p-4 text-sm text-nox-muted">No orders logged for this session.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-nox-bg text-nox-muted text-left">
                  <tr>
                    <th className="px-2 py-2">Time</th>
                    <th className="px-2 py-2">Action</th>
                    <th className="px-2 py-2">Mode</th>
                    <th className="px-2 py-2">Leg</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">Entry</th>
                    <th className="px-2 py-2">SL</th>
                    <th className="px-2 py-2">Target</th>
                    <th className="px-2 py-2">LTP</th>
                    <th className="px-2 py-2">P&amp;L</th>
                    <th className="px-2 py-2">Outcome</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeRows.map((o) => {
                    const outcome = liveExitOutcome(o, o.ltp) ?? o.outcome ?? '—';
                    return (
                    <tr key={`trade-${o.id}-${o.time}-${o.action}`} className="border-t border-nox-line/60">
                      <td className="px-2 py-2 text-nox-muted">{new Date(o.time).toLocaleTimeString()}</td>
                      <td className="px-2 py-2 font-mono text-white">{o.action ?? 'BUY'}</td>
                      <td className="px-2 py-2 text-nox-muted">{o.mode ?? '—'}</td>
                      <td className="px-2 py-2 font-mono text-white">
                        {o.assetType === 'equity' && o.equitySymbol ? o.equitySymbol : `${o.strike} ${o.side}`}
                      </td>
                      <td className="px-2 py-2 font-mono text-white">
                        {o.qty} lot{o.qty !== 1 ? 's' : ''}
                      </td>
                      <td className="px-2 py-2 font-mono">{o.entry.toFixed(2)}</td>
                      <td className="px-2 py-2 font-mono text-rose-300/90">
                        {o.sl > 0 ? o.sl.toFixed(2) : '—'}
                      </td>
                      <td className="px-2 py-2 font-mono text-emerald-300/90">{o.tgt.toFixed(2)}</td>
                      <td className="px-2 py-2 font-mono">{formatOrderLtp(o.ltp)}</td>
                      <td
                        className={`px-2 py-2 font-mono ${o.ltp > 0 ? (o.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-nox-muted'}`}
                      >
                        {o.ltp > 0 ? (
                          <>
                            {o.pnl >= 0 ? '+' : ''}
                            {o.pnl.toFixed(2)}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={`px-2 py-2 text-xs ${outcomeClass(outcome)}`}>{outcome}</td>
                      <td className="px-2 py-2 text-nox-muted">{o.status}</td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-nox-line bg-nox-surface overflow-hidden">
          <div className="px-3 py-2 border-b border-nox-line">
            <h2 className="text-sm font-semibold text-white">Full day log</h2>
            <p className="text-[11px] text-nox-muted">
              Every order event for the session — buys, sells, updates, and status changes
            </p>
          </div>
          {allEntries.length === 0 ? (
            <p className="p-4 text-sm text-nox-muted">No log entries for this session.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-nox-bg text-nox-muted text-left">
                  <tr>
                    <th className="px-2 py-2">Time</th>
                    <th className="px-2 py-2">Action</th>
                    <th className="px-2 py-2">Mode</th>
                    <th className="px-2 py-2">Trigger</th>
                    <th className="px-2 py-2">Leg</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">Entry</th>
                    <th className="px-2 py-2">Exit</th>
                    <th className="px-2 py-2">Order ID</th>
                    <th className="px-2 py-2">Parent</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {allEntries.map((r: OrderLogEntry) => (
                    <tr key={`log-${r.id}-${r.ts}`} className="border-t border-nox-line/60">
                      <td className="px-2 py-2 text-nox-muted whitespace-nowrap">
                        {new Date(r.ts).toLocaleTimeString()}
                      </td>
                      <td className={`px-2 py-2 font-mono ${actionClass(r.action)}`}>{r.action}</td>
                      <td className="px-2 py-2 text-nox-muted">{r.mode}</td>
                      <td className="px-2 py-2 text-nox-muted">{r.trigger || '—'}</td>
                      <td className="px-2 py-2 font-mono text-white">
                        {r.assetType === 'equity' && r.equitySymbol
                          ? r.equitySymbol
                          : `${r.strike} ${r.optionType}`}
                      </td>
                      <td className="px-2 py-2 font-mono text-white">
                        {r.lots ?? 1} lot{(r.lots ?? 1) !== 1 ? 's' : ''}
                        {r.units != null ? (
                          <span className="text-nox-muted"> ({r.units})</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 font-mono">{r.entry != null ? r.entry.toFixed(2) : '—'}</td>
                      <td className="px-2 py-2 font-mono">
                        {r.exitPrice != null ? r.exitPrice.toFixed(2) : r.ltp != null ? r.ltp.toFixed(2) : '—'}
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px] text-nox-muted">{r.orderId ?? '—'}</td>
                      <td className="px-2 py-2 font-mono text-[10px] text-nox-muted">{r.parentBuyId ?? '—'}</td>
                      <td className={`px-2 py-2 ${statusClass(r.status)}`}>{r.status}</td>
                      <td className="px-2 py-2 text-nox-muted max-w-[200px] truncate" title={r.message}>
                        {r.message ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
