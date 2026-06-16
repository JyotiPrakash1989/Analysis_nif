import type { NiftyDayChange } from '../../types/niftyoptima';
import { MstockLoginPromptText } from './MstockLoginPromptText';

type Props = {
  spot: number | null;
  dayChange?: NiftyDayChange | null;
  sentiment: number | null;
  rsi: number | null;
  connected: boolean;
  feedNote?: string | null;
  indexSource?: 'mock' | 'mstock' | 'pending' | 'public';
  indexError?: string;
  indexFromLastCandle?: boolean;
  ipBlocked?: boolean;
  whitelistIp?: string | null;
};

export function HeaderBar({
  spot,
  dayChange,
  sentiment,
  rsi,
  connected,
  feedNote,
  indexSource,
  indexError,
  indexFromLastCandle,
  ipBlocked,
  whitelistIp,
}: Props) {
  const meter = sentiment == null ? 50 : sentiment;
  const tone = meter >= 55 ? 'bg-emerald-500' : meter <= 45 ? 'bg-rose-500' : 'bg-amber-400';
  const src = indexSource ?? 'mock';
  const indexLabel =
    src === 'mstock'
      ? indexFromLastCandle
        ? 'mStock (stale close)'
        : 'mStock live'
      : src === 'public'
        ? indexFromLastCandle
          ? 'Yahoo ^NSEI (delayed)'
          : 'Yahoo ^NSEI (today)'
      : src === 'pending'
        ? 'Fetching…'
        : 'Simulated';
  return (
    <header className="border-b border-nox-line bg-nox-surface/80 backdrop-blur px-4 py-3 flex flex-wrap items-center gap-4 justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider text-nox-muted">Nifty 50 spot</p>
        <p className="text-2xl font-semibold text-white tabular-nums">
          {spot == null ? '—' : spot.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        {dayChange != null && spot != null ? (
          <p
            className={`text-sm font-semibold tabular-nums ${
              dayChange.points >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {dayChange.points >= 0 ? '+' : ''}
            {dayChange.points.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="font-medium">
              ({dayChange.percent >= 0 ? '+' : ''}
              {dayChange.percent.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              %)
            </span>
            <span className="text-nox-muted font-normal text-xs ml-1">
              {dayChange.basis === 'open' ? 'vs open' : 'vs prev close'}
            </span>
          </p>
        ) : null}
        <p className="text-xs text-nox-muted">
          RSI(14): {rsi == null ? '—' : rsi.toFixed(2)} · Index:{' '}
          <span className={src === 'mstock' || src === 'public' ? 'text-cyan-400' : 'text-nox-muted'}>{indexLabel}</span>
          {' · '}
          Socket:{' '}
          <span className={connected ? 'text-emerald-400' : 'text-rose-400'}>{connected ? 'live' : 'reconnecting…'}</span>
        </p>
        {indexError ? (
          <div className="text-[11px] text-amber-300 mt-1 leading-relaxed max-w-xl">
            <MstockLoginPromptText text={indexError} />
            {ipBlocked ? (
              <>
                {' '}
                <a href="/api/mstock/my-ip" target="_blank" rel="noreferrer" className="text-cyan-400 underline">
                  {whitelistIp ? `Verify IP (${whitelistIp})` : 'Check public IP'}
                </a>
              </>
            ) : null}
          </div>
        ) : null}
        {feedNote ? <p className="text-[11px] text-nox-muted mt-1">{feedNote}</p> : null}
      </div>
      <div className="flex flex-col items-end gap-1 min-w-[140px]">
        <p className="text-xs text-nox-muted">Sentiment meter (RSI-scaled)</p>
        <div className="w-full h-2 rounded-full bg-nox-line overflow-hidden">
          <div className={`h-full ${tone}`} style={{ width: `${meter}%` }} />
        </div>
        <p className="text-xs text-nox-muted">{meter.toFixed(0)} / 100</p>
      </div>
    </header>
  );
}
