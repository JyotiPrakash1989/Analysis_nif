import { useNiftyAlpha } from '../context/NiftyAlphaContext';
import { PCR_ZONE_LABELS } from '../types';

export function AnalyticsDashboardCard() {
  const { state } = useNiftyAlpha();
  const analytics = state.analytics;

  if (!analytics) return null;

  const zoneColor =
    analytics.pcrZone === 'overbought'
      ? 'loss'
      : analytics.pcrZone === 'oversold'
        ? 'profit'
        : 'muted';

  return (
    <div className="card analytics-card">
      <div className="card-header">
        <span className="card-icon">📊</span>
        <span className="card-title">Real-Time Analytics</span>
      </div>
      <div className="analytics-body">
        <div className="analytics-row">
          <span>PCR (Put-Call Ratio)</span>
          <span className="pcr-value">
            <strong>{analytics.pcr.toFixed(2)}</strong>
            <span className={`zone-badge ${zoneColor}`}>
              {PCR_ZONE_LABELS[analytics.pcrZone]}
            </span>
          </span>
        </div>
        <div className="analytics-row">
          <span>Max Pain</span>
          <span className="alert">{analytics.maxPainStrike}</span>
        </div>
        <span className="muted small block">OI highlights</span>
        {analytics.oiHighlights.map((h, i) => (
          <div key={i} className="oi-tile">
            <span className="bold">
              {h.strike} {h.optionType}
            </span>
            <span className="alert">{h.oiChangePercent.toFixed(0)}% OI</span>
            <span className="muted small">{h.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
