import type { HoldSuggestion, OrderLogEntry, SignalPayload } from '../types/niftyoptima';

const STORAGE_KEY = 'niftyoptima-voice-alerts';

/** Dedupe target / stop-loss voice (live LTP alert vs order-log sell). */
const spokenExitAlerts = new Set<string>();

export function markExitAlertSpoken(key: string) {
  spokenExitAlerts.add(key);
}

export function wasExitAlertSpoken(key: string) {
  return spokenExitAlerts.has(key);
}

export function readVoiceAlertsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === '0' || v === 'false') return false;
  return true;
}

export function writeVoiceAlertsEnabled(on: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  window.dispatchEvent(new CustomEvent('niftyoptima-voice-change'));
}

const spokenEquitySignals = new Set<string>();

export function markEquitySignalSpoken(key: string) {
  spokenEquitySignals.add(key);
}

export function wasEquitySignalSpoken(key: string) {
  return spokenEquitySignals.has(key);
}

export function signalAlertKey(sig: SignalPayload): string {
  if (sig.dailyPick) {
    const idx = sig.signalIndex ?? 0;
    return `daily-${idx}-${sig.side}-${sig.strike}-${sig.ts}`;
  }
  return `${sig.side}-${sig.strike}-${Math.floor(sig.ts / 5000)}`;
}

export function holdSuggestionAlertKey(hold: HoldSuggestion): string {
  return `hold-${hold.strike}-${hold.optionType}-${hold.suppressedSide ?? 'na'}-${hold.ts}`;
}

/** Spoken when a new setup is found but an open position blocks a fresh signal. */
export function holdForTargetVoiceText(hold: HoldSuggestion): string {
  const leg = hold.optionType === 'CE' ? 'call' : 'put';
  const tgt = Math.round(hold.tgt);
  const entry = Math.round(hold.entry);
  const suppressed =
    hold.suppressedSide && hold.suppressedScore != null
      ? ` A new ${hold.suppressedSide === 'CE' ? 'call' : 'put'} setup scored ${hold.suppressedScore} percent, but `
      : ' ';
  return `Position open.${suppressed}Hold your NIFTY ${hold.strike} ${leg} for more target. Entry ${entry}, target ${tgt}. Do not take a new trade until this position closes.`;
}

/** Spoken line when CE/PE breakout strategy fires (auto or manual mode). */
export function signalVoiceText(sig: SignalPayload, autoTrading: boolean): string {
  const leg = sig.side === 'CE' ? 'call' : 'put';
  const entry = Math.round(sig.entry);
  const modeLine = autoTrading
    ? 'Auto trading on. Order will be placed automatically.'
    : 'Manual trading on. Use execute trade when ready.';
  return `Strategy alert. ${modeLine} Buy ${leg}. NIFTY ${sig.strike} ${sig.optionType}, entry ${entry}. Stop ${Math.round(sig.sl)}, target ${Math.round(sig.tgt)}.`;
}

/** Spoken when user switches auto / manual (if voice is on). */
export function tradingModeVoiceText(autoTrading: boolean): string {
  return autoTrading
    ? 'Auto trading enabled. Voice alerts active for signals and automatic orders.'
    : 'Manual trading enabled. Voice alerts active for signals and manual orders.';
}

/** Spoken on buy/sell log rows — auto and manual. */
export function orderLogVoiceText(entry: OrderLogEntry): string | null {
  if (entry.action === 'UPDATE') return null;
  const leg = entry.optionType === 'CE' ? 'call' : 'put';
  const mode = entry.mode === 'auto' ? 'Automatic' : 'Manual';

  if (entry.action === 'BUY') {
    const entryPx = Math.round(Number(entry.entry) || 0);
    const tgt = Math.round(Number(entry.tgt) || 0);
    if (entry.status === 'failed') {
      return `${mode} buy failed for NIFTY ${entry.strike} ${leg}.`;
    }
    return `${mode} buy placed. NIFTY ${entry.strike} ${leg}, entry ${entryPx}, target ${tgt}.`;
  }

  if (entry.action === 'SELL') {
    const exitPx = Math.round(Number(entry.exitPrice ?? entry.ltp ?? entry.entry) || 0);
    const sl = Math.round(Number(entry.sl) || 0);
    const tgt = Math.round(Number(entry.tgt) || 0);
    const isClosing =
      entry.status === 'target_exit' ||
      entry.status === 'stoploss_exit' ||
      entry.status === 'closed';
    if (entry.trigger === 'target') {
      if (isClosing) {
        return `Target completed. NIFTY ${entry.strike} ${leg} reached target ${tgt}. Premium ${exitPx}. ${mode} sell filled.`;
      }
      return `${mode} target sell placed at ${tgt} for NIFTY ${entry.strike} ${leg}.`;
    }
    if (entry.trigger === 'stoploss') {
      if (isClosing) {
        return `Stop loss triggered. NIFTY ${entry.strike} ${leg} hit stop ${sl}. Premium ${exitPx}. ${mode} sell filled.`;
      }
      return `${mode} stop-loss sell placed at ${sl} for NIFTY ${entry.strike} ${leg}.`;
    }
    return `${mode} sell placed. NIFTY ${entry.strike} ${leg}, exit near ${exitPx}.`;
  }

  return null;
}

export function orderLogAlertKey(entry: OrderLogEntry): string {
  return `${entry.action}-${entry.trigger || 'na'}-${entry.orderId || entry.id}-${entry.ts}`;
}

/** Immediate alert when live premium crosses target or stop (before/during exit order). */
export function positionExitVoiceText(
  strike: number,
  optionType: 'CE' | 'PE',
  kind: 'target' | 'stoploss',
  ltp: number,
  level: number
): string {
  const leg = optionType === 'CE' ? 'call' : 'put';
  const px = Math.round(ltp);
  const lvl = Math.round(level);
  if (kind === 'target') {
    return `Target completed. NIFTY ${strike} ${leg} premium ${px} reached target ${lvl}.`;
  }
  return `Stop loss triggered. NIFTY ${strike} ${leg} premium ${px} hit stop loss ${lvl}.`;
}

export function positionExitAlertKey(orderId: string, kind: 'target' | 'stoploss'): string {
  return `exit-alert-${orderId}-${kind}`;
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return undefined;
  return (
    voices.find((v) => v.lang === 'en-IN') ??
    voices.find((v) => v.lang.startsWith('en-IN')) ??
    voices.find((v) => v.lang.startsWith('en-GB')) ??
    voices.find((v) => v.lang.startsWith('en'))
  );
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speakStrategyText(text: string): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-IN';
  utter.rate = 0.92;
  utter.pitch = 1;
  const voice = pickVoice();
  if (voice) utter.voice = voice;

  const run = () => {
    const v = pickVoice();
    if (v) utter.voice = v;
    window.speechSynthesis.speak(utter);
  };

  if (window.speechSynthesis.getVoices().length) run();
  else {
    const onVoices = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
      run();
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoices);
    run();
  }
}

export function speakStrategySignal(sig: SignalPayload, autoTrading: boolean): void {
  speakStrategyText(signalVoiceText(sig, autoTrading));
}

export function speakOrderLogEntry(entry: OrderLogEntry): void {
  const text = orderLogVoiceText(entry);
  if (text) speakStrategyText(text);
}

export function speakTradingMode(autoTrading: boolean): void {
  speakStrategyText(tradingModeVoiceText(autoTrading));
}

export type EquitySignalVoice = {
  symbol: string;
  entry: number;
  sl: number;
  tgt: number;
  confidence: number;
  autoTrading?: boolean;
  ts: number;
  minConfidence?: number;
  minTargetPct?: number;
  rewardPct?: number;
};

export function equitySignalAlertKey(sig: EquitySignalVoice): string {
  const bucket = Math.floor(sig.ts / (15 * 60 * 1000));
  return `eq-${sig.symbol}-${sig.confidence}-${bucket}`;
}

export function equityPurchaseVoiceText(sig: EquitySignalVoice, orderPlaced?: boolean): string {
  const entry = Math.round(Number(sig.entry) || 0);
  const tgt = Math.round(Number(sig.tgt) || 0);
  const sl = Math.round(Number(sig.sl) || 0);
  const auto = sig.autoTrading !== false;
  const rewardPct =
    sig.rewardPct ??
    (entry > 0 && tgt > entry ? Math.round(((tgt - entry) / entry) * 1000) / 10 : null);
  const filterLine =
    sig.minConfidence != null && sig.minTargetPct != null
      ? ` Meets your ${sig.minConfidence} percent confidence and ${sig.minTargetPct} percent target settings.`
      : '';
  const moveLine =
    rewardPct != null ? ` Target move ${rewardPct} percent.` : '';
  const orderLine = orderPlaced
    ? 'Auto order placed with quantity 1.'
    : auto
      ? 'Auto order will be placed with quantity 1.'
      : 'Review the purchase suggestion on screen.';
  return `Stock purchase alert. Buy ${sig.symbol} for intraday. Entry ${entry}, target ${tgt}, stop loss ${sl}. Confidence ${sig.confidence} percent.${moveLine}${filterLine} ${orderLine}`;
}

export function equityOrderVoiceText(entry: {
  equitySymbol?: string;
  symbol?: string;
  action: string;
  mode?: string;
  trigger?: string;
  entry?: number;
  sl?: number;
  tgt?: number;
  exitPrice?: number;
  ltp?: number;
  status?: string;
  units?: number;
}): string | null {
  const sym = entry.equitySymbol || entry.symbol || 'stock';
  const mode = entry.mode === 'auto' ? 'Automatic' : 'Manual';
  if (entry.action === 'BUY') {
    if (entry.status === 'failed') return `${mode} buy failed for ${sym}.`;
    const px = Math.round(Number(entry.entry) || 0);
    const tgt = Math.round(Number(entry.tgt) || 0);
    const qty = entry.units ?? 1;
    return `${mode} buy placed. ${sym}, quantity ${qty}, entry ${px}, target ${tgt}.`;
  }
  if (entry.action === 'SELL') {
    const exitPx = Math.round(Number(entry.exitPrice ?? entry.ltp ?? entry.entry) || 0);
    const sl = Math.round(Number(entry.sl) || 0);
    const tgt = Math.round(Number(entry.tgt) || 0);
    const isClosing =
      entry.status === 'target_exit' ||
      entry.status === 'stoploss_exit' ||
      entry.status === 'closed';
    if (entry.trigger === 'target') {
      if (isClosing) {
        return `Target completed. ${sym} reached target ${tgt}. Price ${exitPx}.`;
      }
      return `${mode} target sell placed for ${sym} at ${tgt}.`;
    }
    if (entry.trigger === 'stoploss') {
      if (isClosing) {
        return `Stop loss triggered. ${sym} hit stop loss ${sl}. Price ${exitPx}.`;
      }
      return `${mode} stop-loss sell placed for ${sym} at ${sl}.`;
    }
  }
  return null;
}

export function equityPositionExitVoiceText(
  symbol: string,
  kind: 'target' | 'stoploss',
  ltp: number,
  level: number
): string {
  const px = Math.round(ltp);
  const lvl = Math.round(level);
  if (kind === 'target') {
    return `Target completed. ${symbol} price ${px} reached target ${lvl}.`;
  }
  return `Stop loss triggered. ${symbol} price ${px} hit stop loss ${lvl}.`;
}

export function equityPositionExitAlertKey(orderId: string, kind: 'target' | 'stoploss'): string {
  return `eq-exit-alert-${orderId}-${kind}`;
}

export function speakEquitySignal(sig: EquitySignalVoice, orderPlaced?: boolean): void {
  const key = equitySignalAlertKey(sig);
  if (wasEquitySignalSpoken(key)) return;
  markEquitySignalSpoken(key);
  speakStrategyText(equityPurchaseVoiceText(sig, orderPlaced));
}

export function speakEquityOrderLog(entry: Parameters<typeof equityOrderVoiceText>[0]): void {
  const text = equityOrderVoiceText(entry);
  if (text) speakStrategyText(text);
}

export function speakVoiceTest(autoTrading?: boolean): void {
  const mode =
    autoTrading === true
      ? 'Auto trading'
      : autoTrading === false
        ? 'Manual trading'
        : 'Auto or manual trading';
  speakStrategyText(
    `Strategy voice is on. You will hear alerts for ${mode}: signals, buy orders, target completed, and stop loss triggered.`
  );
}
