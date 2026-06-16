/**
 * Intraday equity BUY-only strategy: EMA trend, RSI, 15m breakout, volume, VWAP.
 * Suggests purchase price, target & stop-loss (1:2 risk-reward) — no short/sell signals.
 */

import {
  aggregate15mFrom1m,
  computeRsi,
  istCalendar,
} from './analysis.mjs';

/** @param {number[]} values @param {number} period */
export function computeEma(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

/** Intraday VWAP from 1m bars. */
export function computeVwap(bars) {
  if (!bars?.length) return null;
  let cumTpVol = 0;
  let cumVol = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    const vol = b.volume ?? Math.max(1, (b.high - b.low) * 100);
    cumTpVol += tp * vol;
    cumVol += vol;
  }
  return cumVol > 0 ? cumTpVol / cumVol : null;
}

/** @param {Array<{close:number,volume?:number}>} bars */
function avgVolume(bars, period = 20) {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const sum = slice.reduce((a, b) => a + (b.volume ?? 1), 0);
  return sum / period;
}

/** Minimum intraday share volume (cumulative day) — liquidity gate for slippage control. */
export const MIN_DAY_VOLUME = Number(process.env.EQUITY_MIN_DAY_VOLUME || 200_000);
/** Opening-range end (IST) — no buy signals before this time. */
export const OPENING_RANGE_END_HOUR = 9;
export const OPENING_RANGE_END_MINUTE = 30;
/** Open ≈ Low / High tolerance as fraction of price. */
const OHL_TOLERANCE = 0.0015;
/** Min outperformance vs NIFTY day % for relative-strength bonus. */
const MIN_RELATIVE_STRENGTH_PCT = 0.5;

/** @param {Date} [now] */
export function isBeforeOpeningRange(now = new Date()) {
  const { hour, minute } = istCalendar(now);
  return hour < OPENING_RANGE_END_HOUR || (hour === OPENING_RANGE_END_HOUR && minute < OPENING_RANGE_END_MINUTE);
}

/** First 30 minutes of NSE cash session — Open High/Low window (9:15–9:45 IST). */
export function isWithinOhlWindow(now = new Date()) {
  const { hour, minute } = istCalendar(now);
  return hour === 9 && minute >= 15 && minute < 45;
}

/** @param {number} open @param {number} ref */
function priceNear(open, ref) {
  if (!Number.isFinite(open) || !Number.isFinite(ref) || ref <= 0) return false;
  return Math.abs(open - ref) / ref <= OHL_TOLERANCE;
}

/** Minimum composite setup score — requires trend + breakout + at least one confirmation factor. */
const MIN_BUY_SCORE = 60;
/** RSI sweet spot: strong momentum without overbought exhaustion. */
const RSI_BULL_MIN = 58;
const RSI_BULL_MAX = 68;
/** Volume must exceed this multiple of 20-bar average. */
const MIN_VOLUME_RATIO = 1.5;
/** Max stocks returned in ranked suggestions — quality over quantity. */
export const MAX_RANKED_SUGGESTIONS = 2;
/** Minimum profit score to appear in ranked list. */
export const MIN_PROFIT_SCORE = 90;
/** Minimum upside from purchase price to target (%) for a stock to be suggested. */
export const MIN_SUGGEST_TARGET_MOVE_PCT = 3.5;
/** Minimum strategy confidence (%) for a stock to be suggested. */
export const MIN_SUGGEST_CONFIDENCE_PCT = 82;

/**
 * Intraday purchase suggestion for cash equity (long only).
 * `suggestPurchase` is true only when setup score passes AND user min confidence / target % are met.
 * @param {Array<{open:number,high:number,low:number,close:number,volume?:number,time:number}>} bars1m
 * @param {number} ltp
 * @param {{ minConfidence?: number, minTargetPct?: number }} [filters]
 * @param {{ quote?: { dayOpen?: number, dayHigh?: number, dayLow?: number, volume?: number, changePct?: number } | null, niftyChangePct?: number | null, now?: Date }} [context]
 */
export function analyzeEquityIntraday(bars1m, ltp, filters = {}, context = {}) {
  const minConfidence = filters.minConfidence ?? MIN_SUGGEST_CONFIDENCE_PCT;
  const minTargetPct = filters.minTargetPct ?? MIN_SUGGEST_TARGET_MOVE_PCT;
  const { quote = null, niftyChangePct = null, now = new Date() } = context;
  const empty = {
    side: null,
    suggestPurchase: false,
    entry: null,
    sl: null,
    tgt: null,
    risk: null,
    reward: null,
    rr: null,
    confidence: 0,
    score: 0,
    rsi: null,
    ema9: null,
    ema21: null,
    vwap: null,
    prior15: null,
    factors: [],
    factorCount: 0,
    qualityGrade: null,
    liquidityOk: true,
    relativeStrength: null,
    sessionBlocked: false,
    rationale: 'Insufficient data — need ~25 intraday bars',
  };

  if (isBeforeOpeningRange(now)) {
    return {
      ...empty,
      sessionBlocked: true,
      rationale: 'Opening range forming — intraday buy signals from 9:30 AM IST',
    };
  }

  if (!bars1m?.length || bars1m.length < 25 || !Number.isFinite(ltp) || ltp <= 0) {
    return empty;
  }

  let dayVolume = Number(quote?.volume) || 0;
  if (dayVolume <= 0) {
    dayVolume = bars1m.reduce((a, b) => a + (Number(b.volume) || 0), 0);
  }
  const liquidityOk = dayVolume >= MIN_DAY_VOLUME;

  const closes = bars1m.map((b) => b.close);
  const rsi = computeRsi(closes, 14);
  const ema9 = computeEma(closes, 9);
  const ema21 = computeEma(closes, 21);
  const vwap = computeVwap(bars1m);
  const { prior } = aggregate15mFrom1m(bars1m);
  const lastBar = bars1m[bars1m.length - 1];
  const avgVol = avgVolume(bars1m, 20);
  const lastVol = lastBar.volume ?? 1;
  const volRatio = avgVol && avgVol > 0 ? lastVol / avgVol : 1;

  const emaTrendBull =
    ema9 != null && ema21 != null && ema9 > ema21 && ltp > ema9;
  const breakoutAbove15m = prior != null && ltp > prior.high;
  const breakoutConfirmed =
    breakoutAbove15m && prior != null && prior.close <= prior.high;
  const rsiInSweetSpot = rsi != null && rsi >= RSI_BULL_MIN && rsi <= RSI_BULL_MAX;
  const volumeSurge = volRatio >= MIN_VOLUME_RATIO;
  const aboveVwap = vwap != null && ltp > vwap;
  const risingCloses =
    closes.length >= 4 &&
    closes[closes.length - 1] > closes[closes.length - 2] &&
    closes[closes.length - 2] > closes[closes.length - 3];

  const dayOpen = quote?.dayOpen ?? bars1m[0]?.open;
  const dayLow = quote?.dayLow ?? Math.min(...bars1m.map((b) => b.low));
  const dayHigh = quote?.dayHigh ?? Math.max(...bars1m.map((b) => b.high));
  const openEqualsLow = isWithinOhlWindow(now) && priceNear(dayOpen, dayLow);
  const openEqualsHigh = isWithinOhlWindow(now) && priceNear(dayOpen, dayHigh);
  const stockChangePct =
    quote?.changePct != null && Number.isFinite(quote.changePct)
      ? quote.changePct
      : quote?.prevClose && quote.prevClose > 0
        ? ((ltp - quote.prevClose) / quote.prevClose) * 100
        : null;
  const relativeStrength =
    stockChangePct != null && niftyChangePct != null && Number.isFinite(niftyChangePct)
      ? Math.round((stockChangePct - niftyChangePct) * 100) / 100
      : null;

  let buyScore = 0;
  const factors = [];

  if (!emaTrendBull || !breakoutAbove15m) {
    if (emaTrendBull) factors.push('Bullish EMA (9>21, price above EMA9)');
    if (breakoutAbove15m) factors.push(`15m breakout above ${prior?.high?.toFixed(2)}`);
    const partialScore =
      (emaTrendBull ? 25 : 0) + (breakoutAbove15m ? 30 : 0);
    return {
      ...empty,
      rsi: rsi == null ? null : Math.round(rsi * 100) / 100,
      ema9: ema9 == null ? null : Math.round(ema9 * 100) / 100,
      ema21: ema21 == null ? null : Math.round(ema21 * 100) / 100,
      vwap: vwap == null ? null : Math.round(vwap * 100) / 100,
      prior15: prior,
      score: partialScore,
      factors,
      qualityGrade: null,
      factorCount: factors.length,
      rationale:
        partialScore === 0
          ? 'No bullish intraday setup — wait for EMA trend + 15m breakout together'
          : `Incomplete setup (score ${partialScore}/${MIN_BUY_SCORE}) — need both EMA trend and 15m breakout`,
    };
  }

  buyScore += 25;
  factors.push('Bullish EMA (9>21, price above EMA9)');
  buyScore += 30;
  factors.push(`15m breakout above ${prior.high.toFixed(2)}`);

  if (breakoutConfirmed) {
    buyScore += 10;
    factors.push('Breakout confirmed (prior 15m closed below high)');
  }

  if (rsiInSweetSpot) {
    buyScore += 15;
    factors.push(`RSI momentum (${rsi.toFixed(1)})`);
  }

  if (volumeSurge) {
    buyScore += 15;
    factors.push(`Volume surge (${(volRatio * 100).toFixed(0)}% of avg)`);
  }

  if (aboveVwap) {
    buyScore += 10;
    factors.push('Price above VWAP');
  }

  if (risingCloses) {
    buyScore += 5;
    factors.push('Short-term price momentum (3 rising closes)');
  }

  if (openEqualsLow) {
    buyScore += 10;
    factors.push('Open ≈ Low (morning buyer control)');
  }

  if (relativeStrength != null && relativeStrength >= MIN_RELATIVE_STRENGTH_PCT) {
    buyScore += 10;
    factors.push(`Outperforming NIFTY (+${relativeStrength.toFixed(2)}% RS)`);
  }

  if (openEqualsHigh) {
    buyScore = Math.max(0, buyScore - 15);
    factors.push('Open ≈ High — sellers in control (caution)');
  }

  const factorCount = factors.length;
  const qualityGrade =
    factorCount >= 6 ? 'A' : factorCount >= 5 ? 'B' : factorCount >= 4 ? 'C' : null;

  const meta = {
    rsi: rsi == null ? null : Math.round(rsi * 100) / 100,
    ema9: ema9 == null ? null : Math.round(ema9 * 100) / 100,
    ema21: ema21 == null ? null : Math.round(ema21 * 100) / 100,
    vwap: vwap == null ? null : Math.round(vwap * 100) / 100,
    prior15: prior,
    score: buyScore,
    factors,
    factorCount,
    qualityGrade,
    liquidityOk,
    relativeStrength,
    sessionBlocked: false,
  };

  if (!liquidityOk) {
    const volLabel =
      dayVolume >= 1_000_000
        ? `${(dayVolume / 1_000_000).toFixed(1)}M`
        : dayVolume >= 1_000
          ? `${Math.round(dayVolume / 1_000)}K`
          : String(Math.round(dayVolume));
    return {
      ...empty,
      ...meta,
      rationale: `Low liquidity (${volLabel} vol < ${MIN_DAY_VOLUME.toLocaleString('en-IN')}) — illiquid for intraday`,
    };
  }

  if (buyScore < MIN_BUY_SCORE) {
    return {
      ...empty,
      ...meta,
      rationale: `High-confluence setup forming (score ${buyScore}/${MIN_BUY_SCORE}) — need volume, RSI, or VWAP confirmation`,
    };
  }

  const entry = Math.round(ltp * 100) / 100;
  const slFrom15 = prior ? prior.low * 0.998 : entry * 0.995;
  const slFromPct = entry * 0.992;
  let sl = Math.min(slFrom15, slFromPct);
  if (sl >= entry) sl = entry * 0.992;
  sl = Math.round(sl * 100) / 100;

  const risk = Math.max(entry - sl, entry * 0.005);
  const rewardFromRr = risk * 2;
  const minTgt = Math.round(entry * (1 + minTargetPct / 100) * 100) / 100;
  const tgt = Math.max(Math.round((entry + rewardFromRr) * 100) / 100, minTgt);
  const reward = Math.round((tgt - entry) * 100) / 100;
  const rr = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 2;

  const baseConfidence =
    52 +
    factorCount * 7 +
    (breakoutConfirmed ? 8 : 0) +
    (volumeSurge ? 5 : 0) +
    (openEqualsLow ? 4 : 0) +
    (relativeStrength != null && relativeStrength >= MIN_RELATIVE_STRENGTH_PCT ? 4 : 0) +
    (openEqualsHigh ? -8 : 0) +
    Math.min(12, Math.max(0, buyScore - MIN_BUY_SCORE) * 0.4);
  const confidence = Math.min(98, Math.round(baseConfidence));
  const targetMovePct = entry > 0 ? ((tgt - entry) / entry) * 100 : 0;
  const meetsConfidence = confidence >= minConfidence;
  const meetsTarget = targetMovePct >= minTargetPct;
  const suggestPurchase = meetsConfidence && meetsTarget;

  let rationale;
  if (suggestPurchase) {
    const gradeLabel = qualityGrade ? ` · grade ${qualityGrade}` : '';
    rationale = `High-confluence buy · score ${buyScore}${gradeLabel} · ${factors.slice(-2).join(' · ')}`;
  } else if (!meetsConfidence && !meetsTarget) {
    rationale = `Setup forming (score ${buyScore}) — needs ${minConfidence}%+ confidence and ${minTargetPct}%+ target (now ${confidence}%, ${targetMovePct.toFixed(1)}%)`;
  } else if (!meetsConfidence) {
    rationale = `Setup forming (score ${buyScore}) — needs ${minConfidence}%+ confidence (now ${confidence}%)`;
  } else {
    rationale = `Setup forming (score ${buyScore}) — needs ${minTargetPct}%+ target move (now ${targetMovePct.toFixed(1)}%)`;
  }

  return {
    side: suggestPurchase ? 'BUY' : null,
    suggestPurchase,
    entry,
    sl,
    tgt,
    risk: Math.round(risk * 100) / 100,
    reward: Math.round(reward * 100) / 100,
    rr,
    confidence,
    ...meta,
    rationale,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Classic floor pivot levels from session high, low, and prior close. */
function pivotLevels(high, low, close) {
  const p = (high + low + close) / 3;
  return {
    pivot: p,
    r1: 2 * p - low,
    r2: p + (high - low),
    s1: 2 * p - high,
    s2: p - (high - low),
  };
}

/** Local swing highs/lows from intraday bars. */
function findSwingLevels(bars, lookback = 3) {
  const supports = [];
  const resistances = [];
  if (!bars?.length || bars.length < lookback * 2 + 1) {
    return { supports, resistances };
  }
  for (let i = lookback; i < bars.length - lookback; i++) {
    const hi = bars[i].high;
    const lo = bars[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (bars[j].high >= hi) isHigh = false;
      if (bars[j].low <= lo) isLow = false;
    }
    if (isHigh) resistances.push(hi);
    if (isLow) supports.push(lo);
  }
  return { supports, resistances };
}

/**
 * Nearest intraday support (below LTP) and resistance (above LTP).
 * Uses day range, pivot points, VWAP, prior 15m candle, and swing levels.
 */
export function computeSupportResistance(bars1m, ltp, quote = null, extras = {}) {
  if (!Number.isFinite(ltp) || ltp <= 0) return null;

  const supportCandidates = [];
  const resistanceCandidates = [];
  let pivot = null;

  if (quote?.dayHigh != null && quote?.dayLow != null && quote?.prevClose != null) {
    const pivots = pivotLevels(quote.dayHigh, quote.dayLow, quote.prevClose);
    pivot = round2(pivots.pivot);
    if (quote.dayLow < ltp) supportCandidates.push(quote.dayLow);
    if (quote.dayHigh > ltp) resistanceCandidates.push(quote.dayHigh);
    if (pivots.s1 < ltp) supportCandidates.push(pivots.s1);
    if (pivots.s2 < ltp) supportCandidates.push(pivots.s2);
    if (pivots.r1 > ltp) resistanceCandidates.push(pivots.r1);
    if (pivots.r2 > ltp) resistanceCandidates.push(pivots.r2);
  }

  const vwap = extras.vwap;
  if (vwap != null && Number.isFinite(vwap)) {
    if (vwap < ltp) supportCandidates.push(vwap);
    if (vwap > ltp) resistanceCandidates.push(vwap);
  }

  const prior15 = extras.prior15;
  if (prior15) {
    if (prior15.low < ltp) supportCandidates.push(prior15.low);
    if (prior15.high > ltp) resistanceCandidates.push(prior15.high);
  }

  if (bars1m?.length >= 15) {
    const swings = findSwingLevels(bars1m.slice(-120));
    for (const s of swings.supports) {
      if (s < ltp) supportCandidates.push(s);
    }
    for (const r of swings.resistances) {
      if (r > ltp) resistanceCandidates.push(r);
    }
  }

  const support = supportCandidates.length ? round2(Math.max(...supportCandidates)) : null;
  const resistance = resistanceCandidates.length ? round2(Math.min(...resistanceCandidates)) : null;

  return { support, resistance, pivot };
}

/** Upside % from suggested purchase price to target. */
export function targetMovePercent(stock) {
  const entry = Number(stock?.analysis?.entry);
  const tgt = Number(stock?.analysis?.tgt);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(tgt)) return null;
  return ((tgt - entry) / entry) * 100;
}

export function meetsMinSuggestTargetMove(stock, minPct = MIN_SUGGEST_TARGET_MOVE_PCT) {
  const pct = targetMovePercent(stock);
  return pct != null && pct >= minPct;
}

export function meetsMinSuggestConfidence(stock, minPct = MIN_SUGGEST_CONFIDENCE_PCT) {
  const confidence = Number(stock?.analysis?.confidence);
  return Number.isFinite(confidence) && confidence >= minPct;
}

/** Full buy suggestion gate — strategy score + user filter settings. */
export function stockMeetsSuggestFilters(stock, filters = {}) {
  const minConfidence = filters.minConfidence ?? MIN_SUGGEST_CONFIDENCE_PCT;
  const minTargetPct = filters.minTargetPct ?? MIN_SUGGEST_TARGET_MOVE_PCT;
  const a = stock?.analysis;
  return (
    Boolean(a?.suggestPurchase) &&
    a?.side === 'BUY' &&
    Number(stock?.ltp) > 0 &&
    meetsMinSuggestConfidence(stock, minConfidence) &&
    meetsMinSuggestTargetMove(stock, minTargetPct)
  );
}

/** Profit potential score — favors confidence, upside, R:R, and setup quality. */
export function computeProfitScore(stock) {
  const a = stock?.analysis;
  if (!a?.entry || !a?.tgt) return 0;
  const rewardPct = ((a.tgt - a.entry) / a.entry) * 100;
  const confidence = a.confidence ?? 0;
  const rr = a.rr ?? 2;
  const gradeBoost = a.qualityGrade === 'A' ? 1.15 : a.qualityGrade === 'B' ? 1.08 : 1;
  const rrBoost = rr >= 2 ? 1.1 : 1;
  const rsBoost =
    a.relativeStrength != null && a.relativeStrength >= MIN_RELATIVE_STRENGTH_PCT ? 1.06 : 1;
  const raw = confidence * (1 + rewardPct / 8) * gradeBoost * rrBoost * rsBoost;
  return Math.round(raw * 100) / 100;
}

/**
 * Rank stocks meeting min confidence and target upside, by profit potential.
 * Returns at most MAX_RANKED_SUGGESTIONS high-quality picks.
 * @param {object[]} analyses
 * @param {{ minConfidence?: number, minTargetPct?: number }} [filters]
 */
export function rankByProfitPotential(analyses, filters = {}) {
  const minConfidence = filters.minConfidence ?? MIN_SUGGEST_CONFIDENCE_PCT;
  const minTargetPct = filters.minTargetPct ?? MIN_SUGGEST_TARGET_MOVE_PCT;

  return [...analyses]
    .filter(
      (a) =>
        a.analysis?.suggestPurchase &&
        a.analysis?.side === 'BUY' &&
        a.ltp > 0 &&
        meetsMinSuggestTargetMove(a, minTargetPct) &&
        meetsMinSuggestConfidence(a, minConfidence)
    )
    .map((a) => {
      const rewardPct = a.analysis.entry
        ? ((a.analysis.tgt - a.analysis.entry) / a.analysis.entry) * 100
        : 0;
      const profitScore = computeProfitScore(a);
      return {
        ...a,
        profitScore,
        rewardPct: Math.round(rewardPct * 100) / 100,
      };
    })
    .filter((a) => a.profitScore >= MIN_PROFIT_SCORE)
    .sort((a, b) => b.profitScore - a.profitScore)
    .slice(0, MAX_RANKED_SUGGESTIONS);
}
