/**
 * Multiple high-quality buy signals per IST trading day.
 * Scores CE vs PE setups; emits when confidence clears MIN_DAILY_SCORE.
 * One signal per completed 15m prior bar (deduped). When a position is open,
 * new setups are suppressed from UI and surfaced as hold-for-target voice hints.
 */

import { buildBreakoutSignal, istCalendar } from './analysis.mjs';

/** Default minimum composite score (0–100) to emit a buy signal. */
export const DEFAULT_MIN_DAILY_SCORE = 92;
/** @deprecated use DEFAULT_MIN_DAILY_SCORE or user setting */
export const MIN_DAILY_SCORE = DEFAULT_MIN_DAILY_SCORE;

/** CE: RSI must exceed this (stricter than live card 60). */
export const CE_RSI_MIN = 62;
/** PE: RSI must be below this. */
export const PE_RSI_MAX = 38;

export function istDateKey(now = new Date()) {
  const { year, month, day } = istCalendar(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Unique key per breakout window — allows multiple signals per day when prior 15m bar changes.
 * @param {string} dayKey
 * @param {'CE'|'PE'} side
 * @param {{end:number}|null} prior15
 */
export function signalWindowKey(dayKey, side, prior15) {
  const windowEnd = prior15?.end ?? 0;
  return `${dayKey}-${side}-${windowEnd}`;
}

/**
 * @param {number} spot
 * @param {{high:number,low:number}|null} prior
 * @param {number|null} rsi
 * @param {number} prevClose
 */
export function scoreCeSetup(spot, prior, rsi, prevClose) {
  if (!prior || rsi == null || !Number.isFinite(spot)) return 0;
  const brokeUp = spot > prior.high && prevClose <= prior.high;
  if (!brokeUp || rsi < CE_RSI_MIN) return 0;

  let score = 0;
  score += Math.min(35, ((rsi - CE_RSI_MIN) / (100 - CE_RSI_MIN)) * 35);

  const pointsBeyond = spot - prior.high;
  score += Math.min(25, Math.max(0, pointsBeyond) * 2.5);

  const range = prior.high - prior.low;
  if (range > 0) {
    const pos = (spot - prior.low) / range;
    score += pos >= 0.65 ? 20 : pos * 15;
  }

  if (prevClose <= prior.high) score += 10;
  if (brokeUp && rsi >= 75 && pointsBeyond >= 10) score += 5;
  return Math.round(Math.min(100, score) * 10) / 10;
}

/**
 * @param {number} spot
 * @param {{high:number,low:number}|null} prior
 * @param {number|null} rsi
 * @param {number} prevClose
 */
export function scorePeSetup(spot, prior, rsi, prevClose) {
  if (!prior || rsi == null || !Number.isFinite(spot)) return 0;
  const brokeDown = spot < prior.low && prevClose >= prior.low;
  if (!brokeDown || rsi > PE_RSI_MAX) return 0;

  let score = 0;
  score += Math.min(35, ((PE_RSI_MAX - rsi) / PE_RSI_MAX) * 35);

  const pointsBeyond = prior.low - spot;
  score += Math.min(25, Math.max(0, pointsBeyond) * 2.5);

  const range = prior.high - prior.low;
  if (range > 0) {
    const pos = (prior.high - spot) / range;
    score += pos >= 0.65 ? 20 : pos * 15;
  }

  if (prevClose >= prior.low) score += 10;
  if (brokeDown && rsi <= 30 && pointsBeyond >= 10) score += 5;
  return Math.round(Math.min(100, score) * 10) / 10;
}

/**
 * Pick CE or PE for the current setup; null if neither setup is strong enough.
 * @param {{rsi:number|null, prior15:object|null, prevClose:number|null, rules:{ce:object|null,pe:object|null}}} ctx
 */
export function pickBestSideForDay(ctx, spot, minScore = DEFAULT_MIN_DAILY_SCORE) {
  const prior = ctx.prior15;
  const rsi = ctx.rsi;
  const prevClose = ctx.prevClose ?? spot;
  if (!prior || rsi == null) return null;

  const ceScore = scoreCeSetup(spot, prior, rsi, prevClose);
  const peScore = scorePeSetup(spot, prior, rsi, prevClose);

  const ceReady = ctx.rules?.ce?.ready === true;
  const peReady = ctx.rules?.pe?.ready === true;

  let side = null;
  let score = 0;

  if (ceScore >= minScore && peScore >= minScore) {
    if (ceScore >= peScore) {
      side = 'CE';
      score = ceScore;
    } else {
      side = 'PE';
      score = peScore;
    }
  } else if (ceScore >= minScore && ceScore >= peScore) {
    side = 'CE';
    score = ceScore;
  } else if (peScore >= minScore && peScore > ceScore) {
    side = 'PE';
    score = peScore;
  } else if (ceReady && ceScore >= peScore && ceScore >= minScore) {
    side = 'CE';
    score = ceScore;
  } else if (peReady && peScore > ceScore && peScore >= minScore) {
    side = 'PE';
    score = peScore;
  }

  if (!side || score < minScore) return null;
  return { side, score };
}

/**
 * @param {{dayKey:string, emittedKeys?:string[], signalsToday?:number, lastSignal?:object|null}} state
 * @param {object} params
 */
export function resolveDailyBestBuy({
  state,
  now = Date.now(),
  spot,
  ctx,
  chainRows = [],
  hasOpenPosition = false,
  openPosition = null,
  minScore = DEFAULT_MIN_DAILY_SCORE,
}) {
  const dayKey = istDateKey(new Date(now));
  const emittedKeys =
    state?.dayKey === dayKey && Array.isArray(state.emittedKeys) ? [...state.emittedKeys] : [];
  const signalsToday = state?.dayKey === dayKey ? (state.signalsToday ?? 0) : 0;
  const lastSignal = state?.dayKey === dayKey ? (state.lastSignal ?? null) : null;

  const empty = {
    signal: null,
    dayKey,
    isNewSignal: false,
    suppressedByPosition: false,
    holdSuggestion: null,
    ceScore: 0,
    peScore: 0,
    signalsToday,
    emittedKeys,
    lastSignal,
  };

  if (spot == null || !Number.isFinite(spot) || !ctx) return empty;

  const ceScore = scoreCeSetup(spot, ctx.prior15, ctx.rsi, ctx.prevClose ?? spot);
  const peScore = scorePeSetup(spot, ctx.prior15, ctx.rsi, ctx.prevClose ?? spot);
  const pick = pickBestSideForDay(ctx, spot, minScore);

  if (!pick || pick.score < minScore) {
    return { ...empty, ceScore, peScore, lastSignal };
  }

  const windowKey = signalWindowKey(dayKey, pick.side, ctx.prior15);
  const alreadyEmitted = emittedKeys.includes(windowKey);

  const base = buildBreakoutSignal(pick.side, spot, ctx.rsi, now, chainRows);
  if (!base) return { ...empty, ceScore, peScore, lastSignal };

  const candidate = {
    ...base,
    dailyPick: true,
    confidence: Math.round(pick.score),
    signalIndex: alreadyEmitted ? signalsToday : signalsToday + 1,
    rationale: `Best ${pick.side} setup (${Math.round(pick.score)}% score) · ${base.rationale}`,
  };

  if (hasOpenPosition) {
    const pos = openPosition ?? {};
    const holdSuggestion = {
      ts: now,
      strike: Number(pos.strike) || candidate.strike,
      optionType: pos.optionType || candidate.optionType,
      entry: Number(pos.entry) || candidate.entry,
      sl: Number(pos.sl) || candidate.sl,
      tgt: Number(pos.tgt) || candidate.tgt,
      suppressedSide: pick.side,
      suppressedScore: Math.round(pick.score),
      reason: alreadyEmitted ? 'position_open' : 'new_setup_while_holding',
    };
    return {
      ...empty,
      ceScore,
      peScore,
      signalsToday,
      emittedKeys,
      lastSignal,
      suppressedByPosition: true,
      holdSuggestion: alreadyEmitted ? null : holdSuggestion,
      candidateSignal: alreadyEmitted
        ? null
        : {
            ...candidate,
            rationale: `Higher-scored ${pick.side} setup (${Math.round(pick.score)}%) while position open · ${candidate.rationale}`,
          },
    };
  }

  if (alreadyEmitted) {
    return {
      ...empty,
      signal: lastSignal,
      ceScore,
      peScore,
      signalsToday,
      emittedKeys,
      lastSignal,
    };
  }

  const signal = {
    ...candidate,
    signalIndex: signalsToday + 1,
    rationale: `Strategy ${signalsToday + 1} today · ${candidate.rationale}`,
  };

  return {
    signal,
    dayKey,
    isNewSignal: true,
    suppressedByPosition: false,
    holdSuggestion: null,
    ceScore,
    peScore,
    signalsToday: signalsToday + 1,
    emittedKeys: [...emittedKeys, windowKey],
    lastSignal: signal,
  };
}
