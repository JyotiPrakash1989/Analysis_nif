import { istDayKey } from './istDay';
import { DEFAULT_MIN_DAILY_SCORE } from './tradingMode';
import type { OrderRow, SignalPayload, StrategyRuleLeg, TickPayload } from '../types/niftyoptima';

export const MIN_DAILY_SCORE = DEFAULT_MIN_DAILY_SCORE;

/** Leading CE or PE for today — never both. */
export function todayLeadingSide(
  dailyMeta: TickPayload['dailyBestBuy'] | null | undefined,
  rules?: { ce: StrategyRuleLeg | null; pe: StrategyRuleLeg | null } | null,
  minScore = DEFAULT_MIN_DAILY_SCORE
): 'CE' | 'PE' | null {
  const today = istDayKey();
  if (dailyMeta?.dayKey && dailyMeta.dayKey !== today) return null;

  const ce = dailyMeta?.ceScore ?? 0;
  const pe = dailyMeta?.peScore ?? 0;

  if (dailyMeta?.signal?.optionType === 'CE' || dailyMeta?.signal?.optionType === 'PE') {
    return dailyMeta.signal.optionType;
  }
  if (dailyMeta?.candidateSignal?.optionType === 'CE' || dailyMeta?.candidateSignal?.optionType === 'PE') {
    return dailyMeta.candidateSignal.optionType;
  }
  if (ce >= minScore || pe >= minScore) return ce >= pe ? 'CE' : 'PE';
  if (rules?.ce?.ready && !rules?.pe?.ready) return 'CE';
  if (rules?.pe?.ready && !rules?.ce?.ready) return 'PE';
  if (rules?.ce?.ready && rules?.pe?.ready) return ce >= pe ? 'CE' : 'PE';
  if (ce > 0 || pe > 0) return ce >= pe ? 'CE' : 'PE';
  return null;
}

function signalRewardRisk(sig: { entry: number; tgt: number; sl: number; risk?: number }): number {
  const entry = Number(sig.entry) || 0;
  const tgt = Number(sig.tgt) || 0;
  const sl = Number(sig.sl) || 0;
  const risk = sig.risk ?? entry - sl;
  if (risk <= 0 || tgt <= entry) return 0;
  return (tgt - entry) / risk;
}

function remainingTargetUpside(pos: OrderRow): number {
  const ltp = pos.ltp > 0 ? pos.ltp : pos.entry;
  const units = pos.units ?? pos.qty * (pos.lotsize ?? 75);
  return Math.max(0, (pos.tgt - ltp) * units);
}

function signalTargetUpside(sig: SignalPayload, units: number): number {
  const entry = Number(sig.entry) || 0;
  const tgt = Number(sig.tgt) || 0;
  if (entry <= 0 || tgt <= entry) return 0;
  return (tgt - entry) * units;
}

/** True when a new setup beats holding the current open buy to target. */
export function isMoreProfitableSuggestion(
  candidate: SignalPayload,
  pos: OrderRow,
  minScore = DEFAULT_MIN_DAILY_SCORE
): boolean {
  if ((candidate.confidence ?? 0) < minScore) return false;

  const units = pos.units ?? pos.qty * (pos.lotsize ?? 75);
  const newUpside = signalTargetUpside(candidate, units);
  const remainUpside = remainingTargetUpside(pos);

  if (newUpside > remainUpside * 1.05) return true;

  const candRr = signalRewardRisk(candidate);
  const posRr = signalRewardRisk(pos);
  if (candRr > posRr && newUpside >= remainUpside) return true;

  if ((candidate.confidence ?? 0) >= minScore + 7 && pos.pnl <= 0) return true;

  return false;
}

/** Today's scored best-buy for call or put; includes better setups while a position is open. */
export function resolveTodaySuggestionSignal(
  tick: TickPayload | null | undefined,
  socketSignal: SignalPayload | null,
  openPosition: OrderRow | null,
  minScore = DEFAULT_MIN_DAILY_SCORE
): SignalPayload | null {
  const today = istDayKey();
  const meta = tick?.dailyBestBuy;

  if (meta?.dayKey === today) {
    if (openPosition) {
      const candidate = meta.candidateSignal ?? null;
      if (candidate && isMoreProfitableSuggestion(candidate, openPosition, minScore)) {
        return candidate;
      }
      return null;
    }
    if (meta.suppressedByPosition || meta.hasOpenPosition) return null;
    if (meta.signal && (meta.signal.confidence ?? 0) >= minScore) return meta.signal;
    return null;
  }

  if (
    socketSignal?.dailyPick &&
    (socketSignal.confidence ?? 0) >= minScore &&
    istDayKey(new Date(socketSignal.ts)) === today
  ) {
    if (openPosition) {
      if (!isMoreProfitableSuggestion(socketSignal, openPosition, minScore)) return null;
      const side = todayLeadingSide(meta, tick?.strategyRules, minScore);
      if (side && socketSignal.optionType !== side) return null;
      return socketSignal;
    }
    const side = todayLeadingSide(meta, tick?.strategyRules, minScore);
    if (side && socketSignal.optionType !== side) return null;
    return socketSignal;
  }

  return null;
}
