/**
 * NiftyOptima analysis: RSI(14), 15m breakout context, TGT/SL per PRD.
 * SL = tighter of (85% of entry = 15% premium risk) vs signal-candle option low.
 * TGT = Entry + 2 * (Entry - SL).
 */

/** Wilder-style RSI on closes; returns null if insufficient data. */
export function computeRsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) avgGain += ch;
    else avgLoss -= ch;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function aggregate15mFrom1m(oneMinuteBars) {
  /** Prior completed 15×1m window vs current forming window (excludes last tick bar when caller passes closed-only). */
  if (oneMinuteBars.length < 32) return { prior: null, current: null };
  const closed = oneMinuteBars.slice(0, -1);
  if (closed.length < 31) return { prior: null, current: null };
  const slice = (start, len) => closed.slice(start, start + len);
  const agg = (chunk) => {
    if (chunk.length === 0) return null;
    let high = -Infinity;
    let low = Infinity;
    const open = chunk[0].open;
    const close = chunk[chunk.length - 1].close;
    for (const b of chunk) {
      high = Math.max(high, b.high);
      low = Math.min(low, b.low);
    }
    return { open, high, low, close, start: chunk[0].time, end: chunk[chunk.length - 1].time };
  };
  const n = closed.length;
  const prior = agg(slice(n - 30, 15));
  const current = agg(slice(n - 15, 15));
  return { prior, current };
}

/**
 * @param {number} entry - option premium at entry
 * @param {number} signalCandleLowOption - estimated option LTP at signal candle low (below entry)
 */
export function calculateLevels(entry, signalCandleLowOption) {
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

/**
 * @param {number} niftySpot
 * @param {number} prior15High
 * @param {number} prior15Low
 * @param {number} prevClose
 * @param {number} rsi
 * @returns {'CE'|'PE'|null}
 */
/** Stricter RSI gates improve win rate vs 60/40 (used with daily best-buy scorer). */
export const CE_RSI_BREAKOUT_MIN = 62;
export const PE_RSI_BREAKOUT_MAX = 38;

export function breakoutSide(niftySpot, prior15High, prior15Low, prevClose, rsi) {
  if (prior15High == null || prior15Low == null || rsi == null) return null;
  const brokeUp = niftySpot > prior15High && prevClose <= prior15High;
  const brokeDown = niftySpot < prior15Low && prevClose >= prior15Low;
  if (brokeUp && rsi > CE_RSI_BREAKOUT_MIN) return 'CE';
  if (brokeDown && rsi < PE_RSI_BREAKOUT_MAX) return 'PE';
  return null;
}

/**
 * Full breakout context for UI + live signals (same rules as breakoutSide).
 * @param {Array<{open:number,high:number,low:number,close:number,time:number}>} oneMinuteBars
 * @param {number} spot
 */
export function evaluateBreakoutContext(oneMinuteBars, spot) {
  const empty = {
    rsi: null,
    prior15: null,
    current15: null,
    side: null,
    prevClose: null,
    rules: { ce: null, pe: null },
  };
  if (!oneMinuteBars?.length || spot == null || !Number.isFinite(spot)) return empty;

  const closes = oneMinuteBars.map((b) => b.close);
  const rsi = computeRsi(closes, 14);
  const closed = oneMinuteBars.length >= 2 ? oneMinuteBars.slice(0, -1) : oneMinuteBars;
  const prevClose = closed.length ? closed[closed.length - 1].close : spot;
  const { prior, current } = aggregate15mFrom1m(oneMinuteBars);
  let side = null;
  let rules = { ce: null, pe: null };

  if (prior && rsi != null) {
    const brokeUp = spot > prior.high && prevClose <= prior.high;
    const brokeDown = spot < prior.low && prevClose >= prior.low;
    const rsiCeOk = rsi > CE_RSI_BREAKOUT_MIN;
    const rsiPeOk = rsi < PE_RSI_BREAKOUT_MAX;
    rules = {
      ce: {
        brokeUp,
        rsiOk: rsiCeOk,
        ready: brokeUp && rsiCeOk,
        priorHigh: prior.high,
        rsiMin: CE_RSI_BREAKOUT_MIN,
      },
      pe: {
        brokeDown,
        rsiOk: rsiPeOk,
        ready: brokeDown && rsiPeOk,
        priorLow: prior.low,
        rsiMax: PE_RSI_BREAKOUT_MAX,
      },
    };
    side = breakoutSide(spot, prior.high, prior.low, prevClose, rsi);
  }

  return {
    rsi: rsi == null ? null : Math.round(rsi * 100) / 100,
    prior15: prior,
    current15: current,
    side,
    prevClose,
    rules,
  };
}

/** Prefer live history when it has enough bars for 15m context; else mock/seed bars. */
export function pickBarsForStrategy(liveBars, fallbackBars) {
  const live = Array.isArray(liveBars) ? liveBars : [];
  const fallback = Array.isArray(fallbackBars) ? fallbackBars : [];
  if (live.length >= 32) return live;
  if (fallback.length >= 32) return fallback;
  if (live.length > 0) return live;
  return fallback;
}

/** Do not replace working CE/PE rule legs with nulls when 15m context is not ready yet. */
export function mergeStrategyRules(ctxRules, fallbackRules) {
  if (ctxRules?.ce || ctxRules?.pe) return ctxRules;
  if (fallbackRules?.ce || fallbackRules?.pe) return fallbackRules;
  return ctxRules ?? fallbackRules ?? { ce: null, pe: null };
}

/**
 * @param {Array<{strike:number,ce?:{ltp:number},pe?:{ltp:number}}>|null|undefined} chainRows
 *   Prefer live broker chain (same as tick payload); falls back to modelled chain.
 */
export function buildBreakoutSignal(side, spot, rsi, ts = Date.now(), chainRows = null) {
  const atm = atmStrike(spot, 50);
  const chain =
    Array.isArray(chainRows) && chainRows.length
      ? chainRows
      : getOptionChainForSpot(spot, atm).chain;
  const row = chain.find((r) => Number(r.strike) === atm);
  if (!row) return null;
  const opt = side === 'CE' ? row.ce : row.pe;
  const entryRaw = opt?.ltp ?? opt?.LTP;
  const entry = Math.round(Number(entryRaw) * 100) / 100;
  if (!Number.isFinite(entry) || entry <= 0) return null;
  const signalCandleLowOption = entry * 0.9;
  const levels = calculateLevels(entry, signalCandleLowOption);
  return {
    side,
    strike: atm,
    optionType: side,
    entry,
    sl: levels.sl,
    tgt: levels.tgt,
    risk: levels.risk,
    rationale: `15m ${side === 'CE' ? 'high' : 'low'} breakout with RSI ${rsi?.toFixed(1)}`,
    ts,
  };
}

export function atmStrike(spot, step = 50) {
  return Math.round(spot / step) * step;
}

/** Strikes shown in UI / chain APIs (step 50). */
export const OPTION_CHAIN_STRIKE_COUNT = 10;

/**
 * Ten strikes at and above spot (none below current price).
 * @param {number} spot
 * @param {number} [step]
 * @param {number} [count]
 */
export function strikesFromSpot(spot, step = 50, count = OPTION_CHAIN_STRIKE_COUNT) {
  if (!Number.isFinite(spot)) return [];
  const atm = atmStrike(spot, step);
  let start = atm;
  if (start < spot) start += step;
  const forward = Array.from({ length: count }, (_, i) => start + i * step);
  // Signals always use ATM — include it even when spot is above ATM.
  if (forward.includes(atm)) return forward;
  return [atm, ...forward.slice(0, Math.max(0, count - 1))];
}

/** @deprecated use strikesFromSpot — kept for callers that still center on ATM */
export function strikesAroundAtm(atm, step = 50, count = OPTION_CHAIN_STRIKE_COUNT) {
  const offset = Math.floor((count - 1) / 2);
  return Array.from({ length: count }, (_, i) => atm + (i - offset) * step);
}

/** Lowest strike in the forward window (for broker scrip filter). */
export function optionChainStrikeMin(spot, step = 50, count = OPTION_CHAIN_STRIKE_COUNT) {
  const strikes = strikesFromSpot(spot, step, count);
  return strikes.length ? strikes[0] : atmStrike(spot, step);
}

/** Highest strike in the forward window. */
export function optionChainStrikeMax(spot, step = 50, count = OPTION_CHAIN_STRIKE_COUNT) {
  const strikes = strikesFromSpot(spot, step, count);
  return strikes.length ? strikes[strikes.length - 1] : atmStrike(spot, step);
}

/** @deprecated */
export function optionChainStrikeRadius(step = 50, count = OPTION_CHAIN_STRIKE_COUNT) {
  return (count - 1) * step + step * 0.1;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Calendar fields in Asia/Kolkata (NSE session). */
export function istCalendar(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    dayOfWeek: weekdayMap[get('weekday')] ?? 0,
  };
}

/**
 * Nearest NIFTY weekly expiry (NSE: Tuesday, 3:30 PM IST).
 * @returns {string} YYYY-MM-DD
 */
export function nearestNiftyWeeklyExpiry(now = new Date()) {
  const { year, month, day, hour, minute, dayOfWeek } = istCalendar(now);
  const afterExpiry = hour > 15 || (hour === 15 && minute >= 30);
  const TUESDAY = 2;
  let daysUntil = (TUESDAY - dayOfWeek + 7) % 7;
  if (daysUntil === 0 && afterExpiry) daysUntil = 7;
  const exp = new Date(Date.UTC(year, month - 1, day + daysUntil));
  const y = exp.getUTCFullYear();
  const m = String(exp.getUTCMonth() + 1).padStart(2, '0');
  const d = String(exp.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** @param {string} iso YYYY-MM-DD */
export function formatNiftyExpiryLabel(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')} ${MONTH_LABELS[m - 1]} ${y}`;
}

/** Calendar days from IST today until expiry date (YYYY-MM-DD), minimum 0. */
export function daysUntilExpiry(expiryIso, now = new Date()) {
  const { year, month, day } = istCalendar(now);
  const todayUtc = Date.UTC(year, month - 1, day);
  const [ey, em, ed] = String(expiryIso || '')
    .split('-')
    .map(Number);
  if (!ey || !em || !ed) return 0;
  const expUtc = Date.UTC(ey, em - 1, ed);
  return Math.max(0, Math.round((expUtc - todayUtc) / 86_400_000));
}

function pseudoUnit(strike, expiryIso, salt) {
  const s = `${strike}|${expiryIso}|${salt}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 10_000) / 10_000;
}

/**
 * Simulated premium for the given expiry (time decay scales with days left).
 * CE is ITM when spot > strike; PE is ITM when strike > spot.
 */
function estimateOptionPremium(spot, strike, isCall, daysToExp) {
  const intrinsic = isCall ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const otmDist = isCall ? Math.max(0, strike - spot) : Math.max(0, spot - strike);
  const timeValue = Math.max(3.5, 42 - otmDist * 0.38 - daysToExp * 2.4);
  return Math.round((intrinsic + timeValue) * 100) / 100;
}

/** @param {unknown} leg */
function normalizeLeg(leg, fallbackLtp) {
  const src = leg && typeof leg === 'object' ? leg : {};
  const ltpRaw = src.ltp ?? src.LTP ?? fallbackLtp;
  const ltp = Number(ltpRaw);
  const oiRaw = src.oiChangePct ?? src.oi_change_pct ?? 0;
  const oi = Number(oiRaw);
  const volRaw = src.volume ?? src.vol ?? 0;
  const vol = Number(volRaw);
  return {
    ltp: Number.isFinite(ltp) ? Math.round(ltp * 100) / 100 : fallbackLtp,
    oiChangePct: Number.isFinite(oi) ? Math.round(oi * 10) / 10 : 0,
    volume: Number.isFinite(vol) && vol >= 0 ? Math.floor(vol) : 0,
  };
}

/** @param {unknown} row */
export function normalizeOptionChainRow(row, spot, expiryIso) {
  if (!row || typeof row !== 'object') return null;
  const strike = Number(row.strike);
  if (!Number.isFinite(strike)) return null;
  const days = daysUntilExpiry(expiryIso);
  const ceFallback = estimateOptionPremium(spot, strike, true, days);
  const peFallback = estimateOptionPremium(spot, strike, false, days);
  const ceSrc = row.ce ?? row.CE;
  const peSrc = row.pe ?? row.PE;
  const noise = pseudoUnit(strike, expiryIso, 'oi');
  const volBase = 8000 + Math.floor(pseudoUnit(strike, expiryIso, 'vol') * 22000);
  const ce = normalizeLeg(ceSrc, ceFallback);
  const pe = normalizeLeg(peSrc, peFallback);
  const ceOi = Number(ceSrc?.oiChangePct ?? ceSrc?.oi_change_pct);
  const peOi = Number(peSrc?.oiChangePct ?? peSrc?.oi_change_pct);
  if (Number.isFinite(ceOi)) ce.oiChangePct = Math.round(ceOi * 10) / 10;
  else ce.oiChangePct = Math.round((noise * 12 - 4) * 10) / 10;
  if (Number.isFinite(peOi)) pe.oiChangePct = Math.round(peOi * 10) / 10;
  else pe.oiChangePct = Math.round((noise * 10 - 6) * 10) / 10;
  const ceVol = Number(ceSrc?.volume ?? ceSrc?.vol);
  const peVol = Number(peSrc?.volume ?? peSrc?.vol);
  if (Number.isFinite(ceVol) && ceVol > 0) ce.volume = Math.floor(ceVol);
  else ce.volume = volBase;
  if (Number.isFinite(peVol) && peVol > 0) pe.volume = Math.floor(peVol);
  else pe.volume = Math.floor(volBase * 0.72);
  return { strike, ce, pe };
}

/** @param {unknown} rows @param {number} spot @param {string} expiryIso */
export function normalizeOptionChainRows(rows, spot, expiryIso) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => normalizeOptionChainRow(row, spot, expiryIso))
    .filter((row) => row != null);
}

/**
 * Simulated chain for one weekly expiry (deterministic CE/PE vs spot & days to expiry).
 * @param {number} spot
 * @param {number} atm
 * @param {string} [expiryIso]
 */
export function buildOptionChainSnapshot(spot, atm, expiryIso = nearestNiftyWeeklyExpiry()) {
  if (!Number.isFinite(spot) || !Number.isFinite(atm)) return [];
  const days = daysUntilExpiry(expiryIso);
  const strikes = strikesFromSpot(spot);
  return strikes.map((strike) => {
    const noise = pseudoUnit(strike, expiryIso, 'oi');
    const volBase = 8000 + Math.floor(pseudoUnit(strike, expiryIso, 'vol') * 22000);
    return {
      strike,
      ce: {
        ltp: estimateOptionPremium(spot, strike, true, days),
        oiChangePct: Math.round((noise * 12 - 4) * 10) / 10,
        volume: volBase,
      },
      pe: {
        ltp: estimateOptionPremium(spot, strike, false, days),
        oiChangePct: Math.round((noise * 10 - 6) * 10) / 10,
        volume: Math.floor(volBase * 0.72),
      },
    };
  });
}

let chainCache = { key: '', chain: [], expiry: '' };

/**
 * Cached option chain so CE/PE stay aligned with header expiry and spot.
 * @param {number} spot
 * @param {number} atm
 * @param {Date} [now]
 */
export function getOptionChainForSpot(spot, atm, now = new Date()) {
  const expiry = nearestNiftyWeeklyExpiry(now);
  if (!Number.isFinite(spot) || !Number.isFinite(atm)) {
    return { chain: [], expiry };
  }
  const key = `${Math.round(spot * 10) / 10}|${atm}|${expiry}`;
  if (chainCache.key === key) return { chain: chainCache.chain, expiry };
  const chain = buildOptionChainSnapshot(spot, atm, expiry);
  chainCache = { key, chain, expiry };
  return { chain, expiry };
}
