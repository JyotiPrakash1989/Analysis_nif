import { useNiftyAlpha } from '../context/NiftyAlphaContext';

export function ExecutionBar() {
  const { state, actions } = useNiftyAlpha();
  const hasPosition = state.hasPosition;

  return (
    <div className="card execution-bar">
      {hasPosition && (
        <>
          <div className="execution-stats">
            <PriceLabel label="Entry" value={state.entryPrice} />
            <PriceLabel label="LTP" value={state.currentPrice} />
            {state.profitPercent != null && (
              <span
                className={`profit-pct ${state.profitPercent >= 0 ? 'profit' : 'loss'}`}
              >
                {state.profitPercent >= 0 ? '+' : ''}
                {state.profitPercent.toFixed(1)}%
              </span>
            )}
          </div>
          {state.trailingSlActive && (
            <div className="trailing-sl">
              <span className="trailing-icon">🔒</span>
              <span className="profit">Trailing SL active (breakeven locked)</span>
            </div>
          )}
          <div className="execution-spacer" />
        </>
      )}
      <div className="execution-buttons">
        <button
          type="button"
          className="btn btn-buy"
          disabled={hasPosition}
          onClick={() => actions.buy()}
        >
          <span aria-hidden>+</span> Buy
        </button>
        <button
          type="button"
          className="btn btn-exit"
          disabled={!hasPosition}
          onClick={() => actions.exitAll()}
        >
          <span aria-hidden>⎋</span> Exit All
        </button>
      </div>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => {
          if (hasPosition && state.currentPrice != null) {
            actions.simulatePriceMove(state.currentPrice + 15);
          }
        }}
      >
        📈 Simulate +15 pts
      </button>
    </div>
  );
}

function PriceLabel({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="price-label">
      <span className="muted small">{label}</span>
      <span className="value">{value != null ? value.toFixed(1) : '—'}</span>
    </div>
  );
}
