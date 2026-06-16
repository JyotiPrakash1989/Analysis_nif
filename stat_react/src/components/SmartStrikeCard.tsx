import { useNiftyAlpha } from '../context/NiftyAlphaContext';
import { OUTLOOK_LABELS, type Outlook } from '../types';

export function SmartStrikeCard() {
  const { state, actions } = useNiftyAlpha();
  const suggestion = state.strikeSuggestion;
  const outlooks: Outlook[] = ['bullish', 'bearish', 'neutral', 'scalping'];

  return (
    <div className="card smart-strike-card">
      <div className="card-header">
        <span className="card-icon">👆</span>
        <span className="card-title">Smart Strike</span>
      </div>
      <div className="outlook-chips">
        {outlooks.map((o) => (
          <button
            key={o}
            type="button"
            className={`chip ${state.outlook === o ? 'selected' : ''}`}
            onClick={() => actions.setOutlook(o)}
          >
            {OUTLOOK_LABELS[o]}
          </button>
        ))}
      </div>
      {suggestion && (
        <div className="suggestion-box">
          <div className="suggestion-row">
            <span className="muted">Suggested strike</span>
            <span className="primary bold">{suggestion.suggestedStrike}</span>
          </div>
          {suggestion.optionType && (
            <p className="muted small">
              {suggestion.optionType} • {suggestion.deltaHint}
            </p>
          )}
          <p className="suggestion-reason">{suggestion.reason}</p>
        </div>
      )}
    </div>
  );
}
