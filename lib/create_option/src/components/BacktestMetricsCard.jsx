import './BacktestMetricsCard.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatExpiry(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function OptionRecommendationBlock({ result }) {
  const rec = result?.optionRecommendation;
  if (!rec) return null;
  const isCall = rec === 'CALL';
  const optionLabel = isCall ? 'NIFTY CALL' : 'NIFTY PUT';

  return (
    <div className={`option-recommendation ${isCall ? 'call' : 'put'}`}>
      <span className="option-recommendation-caption">Recommendation for purchase (after analysis of past data)</span>
      <span className="option-recommendation-label">{optionLabel}</span>
      <div className="option-recommendation-details">
        {result.recommendedStrikePrice != null && (
          <div className="rec-row">
            <span className="rec-label">Strike price</span>
            <span className="rec-value">{result.recommendedStrikePrice}</span>
          </div>
        )}
        {result.recommendedOptionPrice != null && (
          <div className="rec-row">
            <span className="rec-label">Option price</span>
            <span className="rec-value">₹{Number(result.recommendedOptionPrice).toFixed(2)}</span>
          </div>
        )}
        {result.optionEntryPrice != null && (
          <div className="rec-row">
            <span className="rec-label">Entry price</span>
            <span className="rec-value">₹{Number(result.optionEntryPrice).toFixed(2)}</span>
          </div>
        )}
        {result.optionExitPrice != null && (
          <div className="rec-row">
            <span className="rec-label">Exit price</span>
            <span className="rec-value">₹{Number(result.optionExitPrice).toFixed(2)}</span>
          </div>
        )}
        {result.optionStopLoss != null && (
          <div className="rec-row">
            <span className="rec-label">Stop loss</span>
            <span className="rec-value">₹{Number(result.optionStopLoss).toFixed(2)}</span>
          </div>
        )}
        {result.recommendedExpiryDate && (
          <div className="rec-row">
            <span className="rec-label">Expiry date (purchase this expiry)</span>
            <span className="rec-value">{formatExpiry(result.recommendedExpiryDate)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricChip({ label, value }) {
  return (
    <div className="metric-chip">
      <span className="metric-chip-label">{label}</span>
      <span className="metric-chip-value">{value}</span>
    </div>
  );
}

export default function BacktestMetricsCard({ result }) {
  if (!result) return null;

  return (
    <div className="backtest-metrics-card">
      <h2 className="backtest-metrics-title">Performance Metrics</h2>
      <OptionRecommendationBlock result={result} />
      <div className="metrics-wrap">
        <MetricChip label="Win Rate" value={`${Number(result.winRate).toFixed(1)}%`} />
        <MetricChip label="Total Trades" value={String(result.totalTrades)} />
        <MetricChip label="Winning Trades" value={String(result.winningTrades)} />
        <MetricChip label="Max Drawdown" value={`${Number(result.maxDrawdownPercent).toFixed(1)}%`} />
        <MetricChip label="Risk-Reward" value={Number(result.riskRewardRatio).toFixed(2)} />
        <MetricChip label="Net P&L %" value={`${Number(result.netPnl).toFixed(1)}%`} />
      </div>
      {result.summary && <p className="backtest-summary">{result.summary}</p>}
    </div>
  );
}
