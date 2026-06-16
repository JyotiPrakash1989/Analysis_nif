import type { OptionChainRow, SignalPayload } from '../types/niftyoptima';

/** Same rules as server/analysis.mjs — SL 15% premium cap vs signal-candle low; TGT 1:2. */
export function calculateLevels(entry: number, signalCandleLowOption: number) {
  const slFromPremiumPct = entry * 0.85;
  const sl = Math.max(slFromPremiumPct, signalCandleLowOption);
  const risk = Math.max(entry - sl, entry * 0.01);
  const tgt = entry + risk * 2;
  return {
    sl: Math.round(sl * 100) / 100,
    tgt: Math.round(tgt * 100) / 100,
    risk: Math.round(risk * 100) / 100,
  };
}

/** Live CE/PE premium (LTP) for a strike from the option chain. */
export function legLtpFromChain(
  strike: number,
  optionType: 'CE' | 'PE',
  chain: OptionChainRow[]
): number | null {
  if (!chain.length) return null;
  const strikeNum = Number(strike);
  if (!Number.isFinite(strikeNum)) return null;
  const row = chain.find((r) => Number(r.strike) === strikeNum);
  if (!row) return null;
  const leg = optionType === 'CE' ? row.ce : row.pe;
  const ltp = Number(leg?.ltp);
  return Number.isFinite(ltp) && ltp > 0 ? ltp : null;
}

/** Align suggestion entry / SL / target with the option chain row the UI shows. */
export function enrichSignalFromChain(
  signal: SignalPayload,
  chain: OptionChainRow[]
): SignalPayload {
  const entry = legLtpFromChain(signal.strike, signal.optionType, chain);
  if (entry == null) return signal;
  const levels = calculateLevels(entry, entry * 0.9);
  return {
    ...signal,
    entry,
    sl: levels.sl,
    tgt: levels.tgt,
    risk: levels.risk,
  };
}

export function formatPremium(v: number | null | undefined): string {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '—';
}

/** Strategy SL / target from entry (same as server buildBreakoutSignal). */
export function buildStrategyLevelsFromEntry(entry: number) {
  const e = Math.round(Number(entry) * 100) / 100;
  if (!Number.isFinite(e) || e <= 0) return null;
  const levels = calculateLevels(e, e * 0.9);
  return { entry: e, sl: levels.sl, tgt: levels.tgt, risk: levels.risk };
}

/**
 * Fixed strategy levels for display / orders: keep logged entry unless missing or
 * clearly the opposite CE/PE leg; always derive SL / target from entry.
 */
export function resolveFixedStrategyLevels(
  payload: SignalPayload,
  chain: OptionChainRow[] = []
): SignalPayload {
  let entry = Number(payload.entry);
  const correctLtp = legLtpFromChain(payload.strike, payload.optionType, chain);
  const wrongLtp = legLtpFromChain(
    payload.strike,
    payload.optionType === 'CE' ? 'PE' : 'CE',
    chain
  );

  if (correctLtp != null && wrongLtp != null && Number.isFinite(entry) && entry > 0) {
    if (Math.abs(entry - wrongLtp) < Math.abs(entry - correctLtp)) {
      entry = correctLtp;
    }
  } else if (correctLtp != null && (!Number.isFinite(entry) || entry <= 0)) {
    entry = correctLtp;
  }

  const built = buildStrategyLevelsFromEntry(entry);
  if (!built) return payload;
  return { ...payload, ...built };
}

/** Map a logged day suggestion into a signal payload for chain enrichment / orders. */
export function suggestionToSignal(s: {
  side: 'CE' | 'PE';
  optionType: 'CE' | 'PE';
  strike: number;
  entry: number;
  sl: number;
  tgt: number;
  risk?: number;
  rationale?: string;
  ts: number;
  confidence?: number | null;
  signalIndex?: number | null;
}): SignalPayload {
  const entry = Number(s.entry);
  const sl = Number(s.sl);
  const tgt = Number(s.tgt);
  return {
    side: s.side,
    strike: Number(s.strike),
    optionType: s.optionType,
    entry: Number.isFinite(entry) ? entry : 0,
    sl: Number.isFinite(sl) ? sl : 0,
    tgt: Number.isFinite(tgt) ? tgt : 0,
    risk:
      s.risk != null && Number.isFinite(Number(s.risk))
        ? Number(s.risk)
        : Math.max((Number.isFinite(entry) ? entry : 0) - sl, (Number.isFinite(entry) ? entry : 0) * 0.01),
    rationale: s.rationale ?? '',
    ts: s.ts,
    dailyPick: true,
    confidence: s.confidence ?? undefined,
    signalIndex: s.signalIndex ?? undefined,
  };
}
