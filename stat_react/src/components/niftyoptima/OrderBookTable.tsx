import { exportOrdersExcelUrl } from '../../hooks/useOrderLog';
import type { OrderRow } from '../../types/niftyoptima';
import { formatOrderLtp, liveExitOutcome } from '../../types/niftyoptima';

type Props = {
  orders: OrderRow[];
  liveSpot: number | null;
  logDay?: string;
  autoTrading?: boolean;
};

function outcomeClass(outcome: string): string {
  if (outcome === 'Target achieved') return 'text-emerald-400 font-medium';
  if (outcome === 'Stop loss triggered') return 'text-rose-400 font-medium';
  if (outcome === 'Open' || outcome === 'Pending') return 'text-amber-300/90';
  if (outcome === 'Failed') return 'text-rose-300';
  return 'text-nox-muted';
}

export function OrderBookTable({ orders, liveSpot, logDay, autoTrading }: Props) {
  const exportUrl = exportOrdersExcelUrl(logDay);

  return (
    <div className="rounded-xl border border-nox-line bg-nox-surface overflow-hidden">
      <div className="px-3 py-2 border-b border-nox-line flex flex-wrap justify-between items-center gap-2">
        <div>
          <p className="text-sm font-semibold text-white">NIFTY order log &amp; live P&amp;L</p>
          {logDay ? (
            <p className="text-[11px] text-nox-muted">
              Session {logDay}
              {autoTrading ? ' · Auto trading on' : ' · Manual'}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {liveSpot != null ? (
            <span className="text-xs text-nox-muted">Spot ref {liveSpot.toFixed(2)}</span>
          ) : null}
          <a
            href={exportUrl}
            download
            className="rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors"
          >
            Export Excel (CSV)
          </a>
        </div>
      </div>
      {orders.length === 0 ? (
        <p className="p-4 text-sm text-nox-muted">
          No orders logged today. Enable auto mode or execute a manual trade on signal.
        </p>
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
                <th className="px-2 py-2">Stop loss</th>
                <th className="px-2 py-2">Target</th>
                <th className="px-2 py-2">LTP</th>
                <th className="px-2 py-2">P&amp;L</th>
                <th className="px-2 py-2">Outcome</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const outcome = liveExitOutcome(o, o.ltp) ?? o.outcome ?? '—';
                return (
                <tr key={`${o.id}-${o.time}-${o.action}`} className="border-t border-nox-line/60">
                  <td className="px-2 py-2 text-nox-muted">{new Date(o.time).toLocaleTimeString()}</td>
                  <td className="px-2 py-2 font-mono text-white">{o.action ?? 'BUY'}</td>
                  <td className="px-2 py-2 text-nox-muted">{o.mode ?? '—'}</td>
                      <td className="px-2 py-2 font-mono text-white">
                        {o.assetType === 'equity' && o.equitySymbol
                          ? o.equitySymbol
                          : `${o.strike} ${o.side}`}
                      </td>
                  <td className="px-2 py-2 font-mono text-white">
                    {o.qty} lot{o.qty !== 1 ? 's' : ''}
                    {o.units != null ? (
                      <span className="text-nox-muted"> ({o.units})</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 font-mono">{o.entry.toFixed(2)}</td>
                  <td className="px-2 py-2 font-mono text-rose-300/90">
                    {o.sl > 0 ? o.sl.toFixed(2) : '—'}
                  </td>
                  <td className="px-2 py-2 font-mono text-emerald-300/90">{o.tgt.toFixed(2)}</td>
                  <td className="px-2 py-2 font-mono">{formatOrderLtp(o.ltp)}</td>
                  <td className={`px-2 py-2 font-mono ${o.ltp > 0 ? (o.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-nox-muted'}`}>
                    {o.ltp > 0 ? (
                      <>
                        {o.pnl >= 0 ? '+' : ''}
                        {o.pnl.toFixed(2)}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={`px-2 py-2 text-xs ${outcomeClass(outcome)}`}>
                    {outcome}
                  </td>
                  <td className="px-2 py-2 text-nox-muted">{o.status}</td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
