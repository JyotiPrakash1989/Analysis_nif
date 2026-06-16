import './StrategyRulesCard.css';

export default function StrategyRulesCard({ rules }) {
  if (!rules) return null;
  return (
    <div className="strategy-rules-card">
      <h2 className="strategy-rules-title">Strategy Rules</h2>
      <div className="strategy-rules-list">
        <div className="rule-row">
          <span className="rule-label">Entry:</span>
          <span className="rule-text">{rules.entryDescription}</span>
        </div>
        <div className="rule-row">
          <span className="rule-label">Stop-loss:</span>
          <span className="rule-text">{rules.stopLossDescription}</span>
        </div>
        <div className="rule-row">
          <span className="rule-label">Exit:</span>
          <span className="rule-text">{rules.exitDescription}</span>
        </div>
      </div>
    </div>
  );
}
