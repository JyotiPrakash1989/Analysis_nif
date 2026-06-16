/**
 * NIFTY 50 index LTP via mStock Type B (server-side only).
 * Uses raw `https` so GET+JSON-body works (matches Flutter `http.Request('GET', ...)`).
 */

import { httpsJsonRequest } from './mstockHttps.mjs';
import {
  clearMstockIpBlock,
  isMstockIpMismatch,
  isMstockTypeBBlocked,
  markMstockIpBlocked,
  MSTOCK_IP_MISMATCH,
} from './mstockApiGuard.mjs';
import { formatMstockApiMessage, hasMstockSessionJwt, mstockJwtRequiredMessage } from './mstockErrors.mjs';

/** Type B quote tokens — try NIFTY50 (26000) before legacy 999260. */
const NIFTY_QUOTE_TOKEN_CANDIDATES = (
  process.env.MSTOCK_NIFTY_QUOTE_TOKEN || '26000,99926000,999260'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const NIFTY_QUOTE_TOKEN = NIFTY_QUOTE_TOKEN_CANDIDATES[0] || '26000';
/**
 * Historical API token (mStock annexure: NIFTY50 = 26000). Quote token 999260 often fails with IA400.
 * @see https://tradingapi.mstock.com/docs/v1/Annexure/
 */
const NIFTY_HIST_TOKEN_CANDIDATES = (
  process.env.MSTOCK_NIFTY_HIST_TOKEN || '26000,99926000,999260'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let cachedNiftyHistToken = '';
const QUOTE_PATH = '/openapi/typeb/instruments/quote';
const HIST_PATH = '/openapi/typeb/instruments/historical';

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toFiniteNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v.replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readLtpFromQuoteFirst(first) {
  if (!first || typeof first !== 'object') return null;
  const raw =
    first.ltp ??
    first.close ??
    first.last_price ??
    first.lastPrice ??
    first.lastTradedPrice ??
    first.netPrice;
  const n = toFiniteNumber(raw);
  if (n != null) return n;
  return toFiniteNumber(first.close);
}

function extractFetched(decoded) {
  const d = decoded?.data;
  if (Array.isArray(decoded?.fetched)) return decoded.fetched;
  if (d && typeof d === 'object' && !Array.isArray(d) && Array.isArray(d.fetched)) return d.fetched;
  if (Array.isArray(d)) return d;
  return null;
}

function parseQuoteJson(text) {
  let decoded;
  try {
    decoded = JSON.parse(text);
  } catch {
    return { ltp: null, error: 'Invalid JSON from quote API' };
  }
  const st = decoded?.status;
  const ok =
    st === true ||
    st === 'true' ||
    st === 1 ||
    st === '1' ||
    String(st).toLowerCase() === 'true';
  if (!ok) {
    const msg = decoded?.message || decoded?.messageText || decoded?.error || `Quote API status: ${st}`;
    return { ltp: null, error: String(msg) };
  }
  const fetched = extractFetched(decoded);
  if (!Array.isArray(fetched) || fetched.length === 0) {
    return { ltp: null, error: 'No LTP in response' };
  }
  const first = fetched[0];
  const n = readLtpFromQuoteFirst(first);
  if (n != null) return { ltp: n, error: '' };
  return { ltp: null, error: 'No numeric LTP in response' };
}

export function quoteHeaders(apiKey, bearer) {
  const key = typeof apiKey === 'string' ? apiKey.trim().replace(/^\uFEFF/, '') : '';
  const jwt = typeof bearer === 'string' ? bearer.trim() : '';
  const hasJwt = hasMstockSessionJwt(jwt, key);
  // Type B + Flutter client: Bearer <access_token> with X-PrivateKey
  const authHeader = hasJwt ? `Bearer ${jwt}` : `Bearer ${key}`;
  const h = {
    'X-Mirae-Version': '1',
    Authorization: authHeader,
    'X-PrivateKey': key,
  };
  const app = process.env.MSTOCK_APP_NAME || process.env.VITE_MSTOCK_APP_NAME;
  if (app && String(app).trim()) {
    h['X-App-Name'] = String(app).trim();
  }
  return h;
}

/** Same order as Flutter: GET then POST; try each NIFTY index token. */
async function requestQuote(apiKey, bearer, mode) {
  const headers = quoteHeaders(apiKey, bearer);
  let lastText = '';
  for (const symboltoken of NIFTY_QUOTE_TOKEN_CANDIDATES) {
    const body = {
      mode,
      exchangeTokens: { NSE: [symboltoken] },
    };
    for (const method of ['GET', 'POST']) {
      try {
        const { statusCode, text } = await httpsJsonRequest(method, QUOTE_PATH, body, headers);
        lastText = text;
        if (statusCode === 401) {
          lastText = '401 unauthorized';
          continue;
        }
        if (statusCode !== 200) {
          if (markMstockIpBlocked(text)) {
            return { ltp: null, error: 'MSTOCK_IP_MISMATCH' };
          }
          continue;
        }
        const parsed = parseQuoteJson(text);
        if (parsed.ltp != null) return parsed;
        if (parsed.error) {
          if (parsed.error === MSTOCK_IP_MISMATCH) {
            return { ltp: null, error: MSTOCK_IP_MISMATCH };
          }
          lastText = parsed.error;
        }
      } catch (e) {
        lastText = e instanceof Error ? e.message : String(e);
      }
    }
  }
  if (lastText === MSTOCK_IP_MISMATCH || isMstockIpMismatch(lastText)) {
    markMstockIpBlocked(lastText);
    return { ltp: null, error: MSTOCK_IP_MISMATCH };
  }
  const friendly = formatMstockApiMessage(
    lastText.startsWith('Quote: ') ? lastText.slice(7).trim() : lastText
  );
  return {
    ltp: null,
    error: friendly || lastText || 'Quote failed (GET+POST)',
  };
}

/**
 * Batch LTP for NSE tokens (option legs).
 * @returns {Promise<Map<string, number>>} token -> ltp
 */
function mergeQuoteLtps(map, json) {
  const fetched = extractFetched(json);
  if (!Array.isArray(fetched)) return;
  for (const row of fetched) {
    const token = String(row.symbolToken ?? row.token ?? '').trim();
    const n = readLtpFromQuoteFirst(row);
    if (token && n != null) map.set(token, n);
  }
}

/** Batch LTP for F&O / NSE tokens (options are usually on NFO segment). */
export async function fetchNseTokenLtps(apiKey, jwt, tokens) {
  const key = typeof apiKey === 'string' ? apiKey.trim().replace(/^\uFEFF/, '') : '';
  const unique = [...new Set(tokens.map((t) => String(t).trim()).filter(Boolean))];
  const map = new Map();
  if (!key || !unique.length || !hasMstockSessionJwt(jwt, key)) return map;

  const headers = quoteHeaders(key, jwt);
  const bodies = [
    { mode: 'LTP', exchangeTokens: { NFO: unique } },
    { mode: 'LTP', exchangeTokens: { NSE: unique } },
    { mode: 'LTP', exchangeTokens: { NFO: unique, NSE: unique } },
  ];
  for (const body of bodies) {
    for (const method of ['GET', 'POST']) {
      try {
        const { statusCode, text } = await httpsJsonRequest(method, QUOTE_PATH, body, headers);
        if (statusCode !== 200) {
          if (markMstockIpBlocked(text)) break;
          continue;
        }
        clearMstockIpBlock();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          continue;
        }
        mergeQuoteLtps(map, json);
        if (map.size >= unique.length) return map;
      } catch {
        /* try next */
      }
    }
    if (map.size) return map;
  }
  return map;
}

function parseCandleTime(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim().replace(' ', 'T');
    const withTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}+05:30`;
    const ms = Date.parse(withTz);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/** @param {unknown} row @returns {{ time: number, open: number, high: number, low: number, close: number } | null} */
export function parseHistoricalCandle(row) {
  const arr = Array.isArray(row) ? row : [];
  const time = parseCandleTime(arr[0]);
  const open = toFiniteNumber(arr[1]);
  const high = toFiniteNumber(arr[2]);
  const low = toFiniteNumber(arr[3]);
  const close = toFiniteNumber(arr[4]);
  if (time == null || open == null || high == null || low == null || close == null) return null;
  return { time, open, high, low, close };
}

function historicalRangeBody(calendarDaysBack = 2, interval = 'ONE_MINUTE', symboltoken = '') {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - calendarDaysBack);
  return {
    exchange: 'NSE',
    symboltoken,
    interval,
    fromdate: `${dateStr(from)} 09:15`,
    todate: `${dateStr(to)} 15:30`,
  };
}

function niftyHistTokenList() {
  if (cachedNiftyHistToken) return [cachedNiftyHistToken];
  return NIFTY_HIST_TOKEN_CANDIDATES;
}

function isInvalidSecurityTokenError(msg) {
  return /security id not found|IA400|invalid symbol|contract file/i.test(String(msg || ''));
}

/**
 * @param {string} apiKey
 * @param {string} bearer
 * @param {Record<string, string>} body
 * @returns {Promise<{ candles: unknown[], error: string }>}
 */
async function fetchHistoricalCandlesWithBody(apiKey, bearer, body) {
  const headers = quoteHeaders(apiKey, bearer);
  const { symboltoken: _omit, ...bodyBase } = body;
  const tokens = body.symboltoken ? [String(body.symboltoken)] : niftyHistTokenList();
  let lastText = '';

  for (const symboltoken of tokens) {
    const reqBody = { ...bodyBase, symboltoken };
    for (const method of ['GET', 'POST']) {
      try {
        const { statusCode, text } = await httpsJsonRequest(method, HIST_PATH, reqBody, headers);
        lastText = text;
        if (statusCode === 401) {
          lastText = '401 unauthorized';
          continue;
        }
        if (statusCode !== 200) {
          if (markMstockIpBlocked(text)) {
            return { candles: [], error: 'MSTOCK_IP_MISMATCH' };
          }
          continue;
        }

        let json;
        try {
          json = JSON.parse(text);
        } catch {
          continue;
        }
        const st = json?.status;
        const histOk =
          st === true ||
          st === 'true' ||
          st === 1 ||
          st === '1' ||
          String(st).toLowerCase() === 'true';
        if (!histOk) {
          lastText = json?.message || String(st);
          if (isInvalidSecurityTokenError(lastText)) break;
          continue;
        }
        const candles = json?.data?.candles;
        if (!Array.isArray(candles) || candles.length === 0) {
          lastText = 'No historical candles';
          continue;
        }
        clearMstockIpBlock();
        cachedNiftyHistToken = symboltoken;
        return { candles, error: '' };
      } catch (e) {
        lastText = e instanceof Error ? e.message : String(e);
      }
    }
    if (isInvalidSecurityTokenError(lastText)) continue;
  }

  return {
    candles: [],
    error: lastText ? formatMstockApiMessage(lastText) : 'Historical failed',
  };
}

/** @param {string} apiKey @param {string} bearer */
async function fetchHistoricalCandles(apiKey, bearer) {
  return fetchHistoricalCandlesWithBody(apiKey, bearer, historicalRangeBody(2, 'ONE_MINUTE'));
}

export function dayKeyIst(tsMs) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(tsMs));
}

/**
 * Intraday move vs previous session close (or today open if no prior day in bars).
 * @param {number | null} spot
 * @param {Array<{ time: number, open: number, close: number }>} [minuteBars]
 * @param {number | null} [explicitPrevClose] e.g. Yahoo chartPreviousClose
 */
export function computeNiftyDayChange(spot, minuteBars, explicitPrevClose = null) {
  if (spot == null || !Number.isFinite(spot)) return null;

  let prevClose =
    explicitPrevClose != null && Number.isFinite(explicitPrevClose) ? explicitPrevClose : null;
  let dayOpen = null;
  let basis = 'prevClose';

  if (minuteBars?.length) {
    const sorted = [...minuteBars].sort((a, b) => a.time - b.time);
    const todayKey = dayKeyIst(Date.now());
    /** @type {Map<string, typeof sorted>} */
    const byDay = new Map();
    for (const b of sorted) {
      const k = dayKeyIst(b.time);
      const list = byDay.get(k) ?? [];
      list.push(b);
      byDay.set(k, list);
    }
    const todayBars = byDay.get(todayKey) ?? [];
    if (todayBars.length) dayOpen = todayBars[0].open;

    if (prevClose == null) {
      const keys = [...byDay.keys()].sort();
      const todayIdx = keys.indexOf(todayKey);
      if (todayIdx > 0) {
        const prior = byDay.get(keys[todayIdx - 1]);
        if (prior?.length) prevClose = prior[prior.length - 1].close;
      } else if (todayBars.length) {
        prevClose = todayBars[0].open;
        basis = 'open';
      }
    }
  }

  if (prevClose == null || !Number.isFinite(prevClose) || prevClose === 0) return null;
  const points = spot - prevClose;
  const percent = (points / prevClose) * 100;
  return {
    prevClose,
    dayOpen,
    points: Math.round(points * 100) / 100,
    percent: Math.round(percent * 100) / 100,
    basis,
  };
}

function startOfIstSessionMs(tsMs) {
  const key = dayKeyIst(tsMs);
  const ms = Date.parse(`${key}T09:15:00+05:30`);
  return Number.isFinite(ms) ? ms : tsMs;
}

function candlesToBars(candles) {
  const bars = [];
  for (const row of candles) {
    const b = parseHistoricalCandle(row);
    if (b) bars.push(b);
  }
  bars.sort((a, b) => a.time - b.time);
  return bars;
}

/** Roll up mStock 1m candles into one OHLC bar per IST session. */
export function aggregateMinuteBarsToDaily(minuteBars) {
  const byDay = new Map();
  for (const b of minuteBars) {
    const key = dayKeyIst(b.time);
    let d = byDay.get(key);
    if (!d) {
      d = {
        time: startOfIstSessionMs(b.time),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      };
      byDay.set(key, d);
    } else {
      d.high = Math.max(d.high, b.high);
      d.low = Math.min(d.low, b.low);
      d.close = b.close;
    }
  }
  return [...byDay.values()].sort((a, b) => a.time - b.time);
}

function lastUniqueDailyBars(bars, tradingDays) {
  const byDay = new Map();
  for (const b of bars) {
    byDay.set(dayKeyIst(b.time), b);
  }
  return [...byDay.values()].sort((a, b) => a.time - b.time).slice(-tradingDays);
}

async function fetchHistoricalCandlesDaily(apiKey, bearer, calendarLookback = 12) {
  for (const interval of ['DAY', 'ONE_DAY', 'day']) {
    const body = historicalRangeBody(calendarLookback, interval);
    const { candles, error } = await fetchHistoricalCandlesWithBody(apiKey, bearer, body);
    if (candles.length) return { candles, error: '' };
    if (error && error !== 'No historical candles' && error !== 'MSTOCK_IP_MISMATCH') {
      continue;
    }
    if (error === 'MSTOCK_IP_MISMATCH') return { candles, error };
  }
  return { candles: [], error: '' };
}

/** Per-session 1m fetch (mStock often limits multi-day 1m in one call). */
async function fetchNiftyMinuteCandlesByDay(apiKey, bearer, calendarDays) {
  const all = [];
  const to = new Date();
  let lastError = '';
  for (let i = calendarDays - 1; i >= 0; i--) {
    const d = new Date(to);
    d.setDate(d.getDate() - i);
    const dStr = dateStr(d);
    const body = {
      exchange: 'NSE',
      interval: 'ONE_MINUTE',
      fromdate: `${dStr} 09:15`,
      todate: `${dStr} 15:30`,
    };
    const { candles, error } = await fetchHistoricalCandlesWithBody(apiKey, bearer, body);
    if (error === 'MSTOCK_IP_MISMATCH') return { candles: [], error };
    if (error) lastError = error;
    if (candles.length) all.push(...candles);
  }
  return { candles: all, error: all.length ? '' : lastError || 'No 1m candles for date range' };
}

function istDateKey(tsMs) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(tsMs));
}

/** Last 1m close for today's IST session (fresher than multi-day historical rollup). */
async function fetchNiftyTodayLast1mClose(apiKey, bearer) {
  const { candles, error } = await fetchNiftyMinuteCandlesByDay(apiKey, bearer, 1);
  const bars = candlesToBars(candles);
  if (!bars.length) {
    return { ltp: null, error: error || 'No today 1m bars', fromLastCandle: true };
  }
  const last = bars[bars.length - 1];
  const today = istDateKey(Date.now());
  if (istDateKey(last.time) !== today) {
    return { ltp: null, error: 'No 1m bars for today', fromLastCandle: true };
  }
  return { ltp: last.close, error: '', fromLastCandle: true };
}

async function fetchHistoricalClose(apiKey, bearer) {
  const { candles, error } = await fetchHistoricalCandles(apiKey, bearer);
  if (!candles.length) return { ltp: null, error };
  const lastCandle = candles[candles.length - 1];
  const arr = Array.isArray(lastCandle) ? lastCandle : [];
  const close = arr[4];
  const n = toFiniteNumber(close);
  if (n != null) return { ltp: n, error: '', fromLastCandle: true };
  return { ltp: null, error: error || 'No close in last candle' };
}

/**
 * Last N NIFTY daily sessions from mStock Type B historical API only.
 * @param {string} apiKey
 * @param {string} [jwtToken]
 * @param {NodeJS.ProcessEnv} [env]
 * @param {number} [tradingDays]
 */
export async function fetchNiftyDailyBars(apiKey, jwtToken = '', env = process.env, tradingDays = 5) {
  const key = typeof apiKey === 'string' ? apiKey.trim().replace(/^\uFEFF/, '') : '';
  const days = Math.min(10, Math.max(1, Math.floor(tradingDays) || 5));
  if (!key) return { bars: [], error: 'MSTOCK_API_KEY missing', source: 'none' };
  if (isMstockTypeBBlocked()) {
    return { bars: [], error: 'MSTOCK_IP_MISMATCH', source: 'none' };
  }
  const jwt = typeof jwtToken === 'string' ? jwtToken.trim() : '';
  if (!hasMstockSessionJwt(jwt, key)) {
    return { bars: [], error: mstockJwtRequiredMessage(env), source: 'none' };
  }

  const { candles: dailyCandles, error: dailyErr } = await fetchHistoricalCandlesDaily(key, jwt, 14);
  if (dailyCandles.length) {
    const bars = lastUniqueDailyBars(candlesToBars(dailyCandles), days);
    if (bars.length) {
      return { bars, error: '', source: 'mstock' };
    }
  }
  if (dailyErr === 'MSTOCK_IP_MISMATCH') {
    return { bars: [], error: dailyErr, source: 'none' };
  }

  const calendarDays = Math.min(14, days + 5);
  const { candles: minuteCandles, error: minuteErr } = await fetchNiftyMinuteCandlesByDay(
    key,
    jwt,
    calendarDays,
  );
  if (minuteErr === 'MSTOCK_IP_MISMATCH') {
    return { bars: [], error: minuteErr, source: 'none' };
  }
  const dailyFrom1m = aggregateMinuteBarsToDaily(candlesToBars(minuteCandles));
  const bars = dailyFrom1m.slice(-days);
  return {
    bars,
    error: bars.length ? '' : minuteErr || dailyErr || 'No mStock daily bars (log in with OTP)',
    source: bars.length ? 'mstock' : 'none',
  };
}

export async function fetchNifty1mBars(apiKey, jwtToken = '', env = process.env) {
  const key = typeof apiKey === 'string' ? apiKey.trim().replace(/^\uFEFF/, '') : '';
  if (!key) return { bars: [], error: 'MSTOCK_API_KEY missing' };
  if (isMstockTypeBBlocked()) {
    return { bars: [], error: 'MSTOCK_IP_MISMATCH' };
  }
  const jwt = typeof jwtToken === 'string' ? jwtToken.trim() : '';
  if (!hasMstockSessionJwt(jwt, key)) {
    return { bars: [], error: mstockJwtRequiredMessage(env) };
  }
  const { candles, error } = await fetchNiftyMinuteCandlesByDay(key, jwt, 2);
  const bars = candlesToBars(candles);
  if (bars.length) return { bars, error: '' };
  const fallback = await fetchHistoricalCandles(key, jwt);
  const fallbackBars = candlesToBars(fallback.candles);
  return {
    bars: fallbackBars,
    error: fallbackBars.length ? '' : error || fallback.error || 'No 1m bars',
  };
}

/**
 * @param {string} apiKey
 * @param {string} [jwtToken]
 */
export async function fetchNiftyIndexLtp(apiKey, jwtToken = '') {
  const key = typeof apiKey === 'string' ? apiKey.trim().replace(/^\uFEFF/, '') : '';
  if (!key) {
    return { ltp: null, error: 'MSTOCK_API_KEY missing' };
  }
  const jwt = typeof jwtToken === 'string' ? jwtToken.trim() : '';
  if (!hasMstockSessionJwt(jwt, key)) {
    return { ltp: null, error: mstockJwtRequiredMessage() };
  }

  let last = await requestQuote(key, jwt, 'LTP');
  if (last.ltp != null) return { ...last, fromLastCandle: false };

  last = await requestQuote(key, jwt, 'OHLC');
  if (last.ltp != null) return { ...last, fromLastCandle: false };

  const today1m = await fetchNiftyTodayLast1mClose(key, jwt);
  if (today1m.ltp != null) return today1m;

  const hist = await fetchHistoricalClose(key, jwt);
  if (hist.ltp != null) return hist;

  return {
    ltp: null,
    error: last.error || hist.error || 'Unable to fetch NIFTY index',
  };
}
