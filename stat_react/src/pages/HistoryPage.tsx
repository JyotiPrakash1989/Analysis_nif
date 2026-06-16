import { MainChart } from '../components/niftyoptima/MainChart';
import { MstockLoginPromptText } from '../components/niftyoptima/MstockLoginPromptText';
import { useNiftyHistory } from '../hooks/useNiftyHistory';
import type { MinuteBar } from '../types/niftyoptima';

function formatDay(ts: number) {
  return new Date(ts).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatNum(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dayChangePct(bars: MinuteBar[], i: number): number | null {
  if (i <= 0) return null;
  const prev = bars[i - 1].close;
  if (!prev) return null;
  return ((bars[i].close - prev) / prev) * 100;
}

type Props = {
  authTick: number;
};

export function HistoryPage({ authTick }: Props) {
  const { data, loading } = useNiftyHistory(5, authTick);
  const bars = data?.bars ?? [];
  const latest = bars.length ? bars[bars.length - 1] : null;
  const err = data?.indexError ?? '';
  const needsLogin = /jwt|otp|session|401|log in/i.test(err);
  const sourceLabel = bars.length
    ? 'mStock Type B (historical)'
    : loading
      ? 'Loading…'
      : needsLogin
        ? 'mStock — log in required'
        : 'mStock historical';

  return (
    <div className="min-h-screen bg-nox-bg text-slate-100 flex flex-col">
      <header className="border-b border-nox-line bg-nox-surface/80 backdrop-blur px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-nox-muted">Nifty 50 · last 5 sessions</p>
        <p className="text-2xl font-semibold text-white tabular-nums">
          {latest ? formatNum(latest.close) : '—'}
        </p>
        <p className="text-[11px] text-nox-muted mt-1">{sourceLabel}</p>
        {data?.indexError && !bars.length ? (
          <p className="text-[11px] text-amber-200/90 mt-1">
            <MstockLoginPromptText text={data.indexError} />
          </p>
        ) : null}
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-3 py-4 space-y-4">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Daily OHLC</h2>
            <span className="text-[11px] text-nox-muted">{bars.length} trading days</span>
          </div>
          <MainChart
            bars={bars}
            height={320}
            showEma={false}
            showVwap={false}
            emptyMessage={
              loading ? (
                'Loading last 5 sessions from mStock…'
              ) : (
                <MstockLoginPromptText
                  text={
                    data?.indexError ||
                    'No mStock history. Log in with SMS OTP on the app, then open History again.'
                  }
                />
              )
            }
          />
        </section>
        <section className="rounded-xl border border-nox-line bg-nox-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-nox-muted border-b border-nox-line">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium text-right">Open</th>
                <th className="px-3 py-2 font-medium text-right">High</th>
                <th className="px-3 py-2 font-medium text-right">Low</th>
                <th className="px-3 py-2 font-medium text-right">Close</th>
                <th className="px-3 py-2 font-medium text-right">Chg %</th>
              </tr>
            </thead>
            <tbody>
              {[...bars].reverse().map((b, revIdx) => {
                const i = bars.length - 1 - revIdx;
                const chg = dayChangePct(bars, i);
                const up = chg != null && chg >= 0;
                return (
                  <tr key={b.time} className="border-b border-nox-line/60 last:border-0">
                    <td className="px-3 py-2 text-white">{formatDay(b.time)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNum(b.open)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-400/90">
                      {formatNum(b.high)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-400/90">
                      {formatNum(b.low)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-white">
                      {formatNum(b.close)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        chg == null ? 'text-nox-muted' : up ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {chg == null ? '—' : `${up ? '+' : ''}${chg.toFixed(2)}%`}
                    </td>
                  </tr>
                );
              })}
              {!bars.length && !loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-nox-muted text-xs">
                    No historical rows to display.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
