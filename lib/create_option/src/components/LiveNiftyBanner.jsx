import './LiveNiftyBanner.css';

function formatPrice(v) {
  if (v >= 1000) return v.toFixed(2);
  return v.toFixed(2);
}

export default function LiveNiftyBanner({ ltp, loading, error, fromLastCandle, onRefresh }) {
  return (
    <div className="live-nifty-banner" onClick={loading ? undefined : onRefresh} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && !loading && onRefresh?.()}>
      <span className="live-nifty-icon" aria-hidden>📈</span>
      <div className="live-nifty-content">
        <span className="live-nifty-label">
          {fromLastCandle ? 'NIFTY 50 (last close)' : 'Live NIFTY 50'}
        </span>
        {loading && <span className="live-nifty-value loading">Loading…</span>}
        {!loading && ltp != null && <span className="live-nifty-value">{formatPrice(ltp)}</span>}
        {!loading && ltp == null && <span className="live-nifty-value error">{error || '—'}</span>}
      </div>
      {!loading && (
        <button type="button" className="live-nifty-refresh" onClick={(e) => { e.stopPropagation(); onRefresh?.(); }} aria-label="Refresh">
          ↻
        </button>
      )}
    </div>
  );
}
