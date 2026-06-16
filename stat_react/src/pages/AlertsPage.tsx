const ALERTS = [
  { title: 'Nifty 25500 CE', subtitle: '200% OI surge – Possible breakout', isOiSpike: true },
  { title: 'Max Pain', subtitle: 'Shifted to 24400', isOiSpike: false },
  { title: 'PCR', subtitle: 'Moved to oversold zone', isOiSpike: false },
];

export function AlertsPage() {
  return (
    <div className="page scroll" role="region" aria-label="Alerts">
      <div className="page-content">
        <p className="muted">Push notifications for OI spikes and key levels</p>
        <div className="gap" />
        {ALERTS.map((a, i) => (
          <div key={i} className="alert-tile">
            <span className={`alert-avatar ${a.isOiSpike ? 'oi' : ''}`}>
              {a.isOiSpike ? '📈' : 'ℹ️'}
            </span>
            <div className="alert-text">
              <span className="bold">{a.title}</span>
              <span className="muted small">{a.subtitle}</span>
            </div>
          </div>
        ))}
        <div className="gap" />
        <button type="button" className="btn btn-primary full">
          🔔 Manage alert rules
        </button>
      </div>
    </div>
  );
}
