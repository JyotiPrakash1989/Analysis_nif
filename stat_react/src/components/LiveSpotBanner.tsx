import { useNiftyAlpha } from '../context/NiftyAlphaContext';

function formatLtp(v: number): string {
  return v >= 1000 ? v.toFixed(2) : v.toFixed(2);
}

export function LiveSpotBanner() {
  const { state, actions } = useNiftyAlpha();
  const ltp = state.liveNiftyLtp;
  const isLoading = state.liveNiftyLoading;
  const error = state.liveNiftyError;
  const fromCandle = state.liveNiftyFromLastCandle;

  return (
    <div
      className="live-spot-banner"
      role="button"
      tabIndex={0}
      onClick={isLoading ? undefined : () => actions.loadLiveNifty()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isLoading) actions.loadLiveNifty();
      }}
    >
      <span className="live-spot-icon" aria-hidden>📈</span>
      <div className="live-spot-content">
        <span className="live-spot-label">
          {fromCandle ? 'NIFTY 50 (last close)' : 'NIFTY 50 Live'}
        </span>
        {isLoading && (
          <span className="live-spot-value loading">Loading…</span>
        )}
        {!isLoading && ltp != null && (
          <span className="live-spot-value">{formatLtp(ltp)}</span>
        )}
        {!isLoading && ltp == null && (
          <span className="live-spot-value error">{error || '—'}</span>
        )}
      </div>
      {!isLoading && (
        <button
          type="button"
          className="live-spot-refresh"
          onClick={(e) => { e.stopPropagation(); actions.loadLiveNifty(); }}
          aria-label="Refresh"
        >
          ↻
        </button>
      )}
    </div>
  );
}
