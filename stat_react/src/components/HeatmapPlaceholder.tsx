const SECTORS = [
  { name: 'Banking', pct: 0.8 },
  { name: 'IT', pct: 0.3 },
  { name: 'Auto', pct: -0.2 },
  { name: 'FMCG', pct: 0.1 },
  { name: 'Pharma', pct: -0.4 },
  { name: 'Metal', pct: 0.6 },
];

export function HeatmapPlaceholder() {
  return (
    <div className="card heatmap-card">
      <div className="card-header">
        <span className="card-icon">▦</span>
        <span className="card-title">Nifty 50 Heatmap</span>
      </div>
      <p className="muted small">Sectors driving the index</p>
      <div className="heatmap-chips">
        {SECTORS.map(({ name, pct }) => (
          <span
            key={name}
            className={`heatmap-chip ${pct >= 0 ? 'profit' : 'loss'}`}
          >
            {name} {pct >= 0 ? '+' : ''}{(pct * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}
