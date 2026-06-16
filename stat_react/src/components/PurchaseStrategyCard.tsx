import { useNiftyAlpha } from '../context/NiftyAlphaContext';
import { strikeLabel } from '../types';

export function PurchaseStrategyCard() {
  const { state, actions } = useNiftyAlpha();
  const strategy = state.purchaseStrategy;
  const loading = state.strategyLoading;
  const error = state.strategyError;

  return (
    <div className="card purchase-strategy-card">
      <div className="card-header">
        <span className="card-icon">📋</span>
        <span className="card-title">Purchase strategy</span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => actions.loadPurchaseStrategy()}
          disabled={loading}
          aria-label="Refresh strategy"
        >
          {loading ? <span className="spinner small" /> : '↻'}
        </button>
      </div>
      <div className="card-body">
        {loading && (
          <div className="loading-block">
            <span className="spinner" />
          </div>
        )}
        {!loading && strategy && (
          <div className="strategy-box">
            <Row label="Strike" value={strikeLabel(strategy)} valueClass="primary" />
            <Row label="Buy at (entry)" value={`₹${strategy.entryPrice.toFixed(1)}`} valueClass="profit" />
            <Row label="Stop loss" value={`₹${strategy.stopLoss.toFixed(1)}`} valueClass="loss" />
            <Row label="Book profit" value={`₹${strategy.bookProfit.toFixed(1)}`} valueClass="profit" />
          </div>
        )}
        {!loading && !strategy && (
          <p className="muted">{error || 'No strategy available.'}</p>
        )}
        {strategy?.reason && (
          <p className="strategy-reason">{strategy.reason}</p>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: 'primary' | 'profit' | 'loss';
}) {
  return (
    <div className="strategy-row">
      <span className="muted">{label}</span>
      <span className={valueClass ?? ''}>{value}</span>
    </div>
  );
}
