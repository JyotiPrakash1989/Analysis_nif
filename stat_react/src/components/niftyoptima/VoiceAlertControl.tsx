import { isSpeechSupported, speakVoiceTest, writeVoiceAlertsEnabled } from '../../lib/strategyVoice';

type Props = {
  enabled: boolean;
  onChange: (on: boolean) => void;
  autoTrading?: boolean;
};

export function VoiceAlertControl({ enabled, onChange, autoTrading }: Props) {
  const supported = isSpeechSupported();

  const toggle = () => {
    const next = !enabled;
    writeVoiceAlertsEnabled(next);
    onChange(next);
    if (next && supported) speakVoiceTest();
  };

  if (!supported) {
    return (
      <p className="text-[11px] text-amber-200/90">Voice alerts need a browser with speech synthesis (Chrome / Edge recommended).</p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-nox-line pb-2 mb-1">
      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={toggle}
          className="rounded border-nox-line bg-nox-bg text-cyan-500 focus:ring-cyan-500/50"
        />
        <span className="text-xs text-slate-200">
          Voice alerts (signal, buy, target achieved, stop loss)
        </span>
      </label>
      {enabled && (
        <button
          type="button"
          onClick={() => speakVoiceTest(autoTrading)}
          className="text-[11px] text-cyan-400 hover:text-cyan-300 underline"
        >
          Test voice
        </button>
      )}
    </div>
  );
}
