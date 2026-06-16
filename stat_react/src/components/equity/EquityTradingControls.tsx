import type { SuggestFilters } from '../../lib/filterSuggestedStocks';
import { VoiceAlertControl } from '../niftyoptima/VoiceAlertControl';

type Props = {
  voiceEnabled: boolean;
  onVoiceEnabledChange: (on: boolean) => void;
  autoTrading: boolean;
  syncing?: boolean;
  onAutoTradingChange: (auto: boolean) => void;
  suggestFilters?: SuggestFilters;
};

export function EquityTradingControls({
  voiceEnabled,
  onVoiceEnabledChange,
  autoTrading,
  syncing,
  onAutoTradingChange,
  suggestFilters,
}: Props) {
  return (
    <section className="rounded-xl border border-nox-line bg-nox-surface p-4 space-y-3">
      <VoiceAlertControl
        enabled={voiceEnabled}
        onChange={onVoiceEnabledChange}
        autoTrading={autoTrading}
      />
      <div className="rounded-lg border border-nox-line bg-nox-bg/80 p-3 space-y-2">
        <p className="text-xs font-semibold text-white uppercase tracking-wide">Stock auto order</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={syncing}
            onClick={() => onAutoTradingChange(false)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
              !autoTrading
                ? 'bg-cyan-500 text-black'
                : 'bg-nox-surface border border-nox-line text-nox-muted hover:text-white'
            }`}
          >
            Voice only
          </button>
          <button
            type="button"
            disabled={syncing}
            onClick={() => onAutoTradingChange(true)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
              autoTrading
                ? 'bg-emerald-500 text-black'
                : 'bg-nox-surface border border-nox-line text-nox-muted hover:text-white'
            }`}
          >
            Auto buy 1 qty
          </button>
        </div>
        <p className="text-[11px] text-nox-muted leading-relaxed">
          {autoTrading
            ? 'When a stock meets your suggested-list filters'
            : 'Voice alert plays when a stock meets your suggested-list filters'}
          {suggestFilters
            ? ` (${suggestFilters.minConfidence}%+ confidence, ${suggestFilters.minTargetPct}%+ target)`
            : ''}
          {autoTrading
            ? ', voice plays and a buy order is placed automatically with quantity 1 — on any tab.'
            : '. No automatic orders — review suggestions in the table. Works on any tab.'}
        </p>
      </div>
    </section>
  );
}
