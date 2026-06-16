/**
 * Equity quotes: mStock Type B when logged in, Yahoo ^*.NS fallback.
 */

import { httpsGet } from './mstockHttps.mjs';
import { quoteHeaders, parseHistoricalCandle } from './niftyQuote.mjs';
import { hasMstockSessionJwt } from './mstockErrors.mjs';
import { fetchPublicEquityIntraday } from './publicEquitySpot.mjs';
import {
  analyzeEquityIntraday,
  computeSupportResistance,
  rankByProfitPotential,
  isBeforeOpeningRange,
  MIN_SUGGEST_CONFIDENCE_PCT,
  MIN_SUGGEST_TARGET_MOVE_PCT,
} from './equityAnalysis.mjs';
import { readWatchlist } from './equityWatchlist.mjs';
import { getEquityDisplayName } from './equitySymbolSearch.mjs';
import { fetchPublicNiftyIntraday } from './publicNiftySpot.mjs';
import { computeNiftyDayChange } from './niftyQuote.mjs';

const SCAN_CONCURRENCY = Number(process.env.EQUITY_SCAN_CONCURRENCY || 6);
const SNAP_CACHE_MS = Number(process.env.EQUITY_SNAP_CACHE_MS || 25_000);
/** @type {Map<string, { at: number, snap: object }>} */
const snapshotCache = new Map();

const SCRIP_PATH = '/openapi/typeb/instruments/OpenAPIScripMaster';
const HIST_PATH = '/openapi/typeb/instruments/historical';
const QUOTE_PATH = '/openapi/typeb/instruments/quote';

let scripCache = { at: 0, rows: [] };

/** @param {unknown} raw */
function parseInstruments(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const t = raw.trim();
  if (!t.startsWith('[')) return [];
  try {
    const arr = JSON.parse(t);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** @param {string} apiKey @param {string} jwt */
async function loadScripRows(apiKey, jwt) {
  const maxAge = Number(process.env.MSTOCK_SCRIP_CACHE_MS || 300_000);
  if (scripCache.rows.length && Date.now() - scripCache.at < maxAge) {
    return scripCache.rows;
  }
  if (!hasMstockSessionJwt(jwt, apiKey)) return [];
  const headers = quoteHeaders(apiKey, jwt);
  const { statusCode, text } = await httpsGet(SCRIP_PATH, headers);
  if (statusCode !== 200) return [];
  const rows = parseInstruments(text);
  scripCache = { at: Date.now(), rows };
  return rows;
}

function parseEquitySymbol(row) {
  const seg = String(row.exch_seg ?? '').toUpperCase();
  const type = String(row.instrumenttype ?? '').toUpperCase();
  if (seg && !/NSE/.test(seg)) return null;
  if (type && !/EQ|STOCK/.test(type)) return null;
  const tradingsymbol = String(row.tradingsymbol ?? row.name ?? '').trim();
  const symbol = String(row.symbol ?? tradingsymbol.replace(/-EQ$/i, ''))
    .trim()
    .toUpperCase()
    .replace(/-EQ$/, '');
  if (!symbol || symbol.length > 20) return null;
  if (!/^[A-Z0-9&-]+$/.test(symbol)) return null;
  const name = String(row.name ?? row.companyname ?? row.symbol ?? symbol).trim();
  return { symbol, name: name !== symbol ? name : symbol };
}

/** Full NSE equity catalog from scrip master (cached). */
export async function loadEquitySymbolCatalog(apiKey, jwt) {
  const rows = await loadScripRows(apiKey, jwt);
  const bySym = new Map();
  for (const row of rows) {
    const parsed = parseEquitySymbol(row);
    if (!parsed) continue;
    if (!bySym.has(parsed.symbol)) bySym.set(parsed.symbol, parsed);
  }
  return [...bySym.values()];
}

/** @param {string} symbol */
function isEquityRow(row, symbol) {
  const sym = String(symbol).toUpperCase();
  const name = String(row.name ?? row.symbol ?? '').toUpperCase();
  const type = String(row.instrumenttype ?? '').toUpperCase();
  const seg = String(row.exch_seg ?? '').toUpperCase();
  if (!/NSE|EQ/.test(seg) && seg && !seg.includes('NSE')) return false;
  if (type && !/EQ|STOCK/.test(type)) return false;
  const candidates = [row.symbol, row.name, row.tradingsymbol]
    .map((s) => String(s ?? '').toUpperCase().replace(/-EQ$/, ''))
    .filter(Boolean);
  return candidates.some((c) => c === sym || c.startsWith(`${sym}-`));
}

/** @param {string} apiKey @param {string} jwt @param {string} symbol */
export async function resolveEquityToken(apiKey, jwt, symbol) {
  const rows = await loadScripRows(apiKey, jwt);
  for (const row of rows) {
    if (!isEquityRow(row, symbol)) continue;
    const token = String(row.token ?? '').trim();
    if (token) {
      return {
        token,
        tradingsymbol: String(row.tradingsymbol ?? row.name ?? symbol).trim(),
        exchange: 'NSE',
      };
    }
  }
  return null;
}

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** @param {string} apiKey @param {string} jwt @param {string} token */
async function fetchMstockEquity1m(apiKey, jwt, token) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 2);
  const body = {
    exchange: 'NSE',
    symboltoken: token,
    interval: 'ONE_MINUTE',
    fromdate: `${dateStr(from)} 09:15`,
    todate: `${dateStr(to)} 15:30`,
  };
  const headers = quoteHeaders(apiKey, jwt);
  const { httpsJsonRequest } = await import('./mstockHttps.mjs');
  for (const method of ['GET', 'POST']) {
    try {
      const { statusCode, text } = await httpsJsonRequest(method, HIST_PATH, body, headers);
      if (statusCode !== 200) continue;
      const json = JSON.parse(text);
      const raw = json?.data?.candles ?? json?.data ?? [];
      if (!Array.isArray(raw)) continue;
      const bars = raw.map(parseHistoricalCandle).filter(Boolean);
      if (bars.length) return { bars, error: '' };
    } catch {
      /* try next */
    }
  }
  return { bars: [], error: 'Historical fetch failed' };
}

/** @param {string} apiKey @param {string} jwt @param {string} token */
async function fetchMstockEquityLtp(apiKey, jwt, token) {
  const headers = quoteHeaders(apiKey, jwt);
  const { httpsJsonRequest } = await import('./mstockHttps.mjs');
  const body = { mode: 'LTP', exchangeTokens: { NSE: [token] } };
  for (const method of ['GET', 'POST']) {
    try {
      const { statusCode, text } = await httpsJsonRequest(method, QUOTE_PATH, body, headers);
      if (statusCode !== 200) continue;
      const json = JSON.parse(text);
      const fetched = json?.data?.fetched ?? json?.data ?? [];
      const row = Array.isArray(fetched) ? fetched[0] : null;
      const ltp = Number(row?.ltp ?? row?.LTP ?? row?.last_price);
      if (Number.isFinite(ltp) && ltp > 0) return ltp;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** @param {Array<{open:number,high:number,low:number,close:number,volume?:number}>} bars */
export function computeEquityQuoteStats(bars, ltp, prevClose = null) {
  if (!bars?.length || !Number.isFinite(ltp) || ltp <= 0) return null;
  let dayHigh = -Infinity;
  let dayLow = Infinity;
  let volume = 0;
  for (const b of bars) {
    dayHigh = Math.max(dayHigh, b.high);
    dayLow = Math.min(dayLow, b.low);
    volume += Number(b.volume) || 0;
  }
  const dayOpen = bars[0].open;
  const prev = prevClose != null && Number.isFinite(prevClose) ? prevClose : dayOpen;
  const changePts = ltp - prev;
  const changePct = prev > 0 ? (changePts / prev) * 100 : 0;
  return {
    dayOpen: Math.round(dayOpen * 100) / 100,
    dayHigh: Math.round(dayHigh * 100) / 100,
    dayLow: Math.round(dayLow * 100) / 100,
    prevClose: Math.round(prev * 100) / 100,
    changePts: Math.round(changePts * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    volume: Math.round(volume),
  };
}

/** @param {string} apiKey @param {string} jwt @param {string} symbol */
export async function fetchEquitySnapshot(apiKey, jwt, symbol) {
  const sym = String(symbol).toUpperCase();

  if (hasMstockSessionJwt(jwt, apiKey)) {
    const leg = await resolveEquityToken(apiKey, jwt, sym);
    if (leg?.token) {
      const [hist, ltp] = await Promise.all([
        fetchMstockEquity1m(apiKey, jwt, leg.token),
        fetchMstockEquityLtp(apiKey, jwt, leg.token),
      ]);
      const bars = hist.bars ?? [];
      const price = ltp ?? (bars.length ? bars[bars.length - 1].close : null);
      if (price != null && bars.length >= 10) {
        return {
          symbol: sym,
          ltp: price,
          bars,
          source: 'mstock',
          error: '',
          prevClose: bars.length > 1 ? bars[0].open : null,
          tradingsymbol: leg.tradingsymbol,
        };
      }
    }
  }

  const pub = await fetchPublicEquityIntraday(sym);
  return {
    symbol: sym,
    ltp: pub.ltp,
    bars: pub.bars,
    source: pub.source,
    error: pub.error,
    prevClose: pub.prevClose,
    tradingsymbol: `${sym}-EQ`,
  };
}

/** Cached equity snapshot to limit API load when scanning the watchlist. */
async function fetchEquitySnapshotCached(apiKey, jwt, symbol) {
  const sym = String(symbol).toUpperCase();
  const hit = snapshotCache.get(sym);
  if (hit && Date.now() - hit.at < SNAP_CACHE_MS) return hit.snap;
  const snap = await fetchEquitySnapshot(apiKey, jwt, sym);
  snapshotCache.set(sym, { at: Date.now(), snap });
  return snap;
}

/** @param {Array<unknown>} items @param {number} concurrency @param {(item: unknown) => Promise<unknown>} fn */
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/** NIFTY index day % change for relative-strength scoring. */
export async function fetchNiftyDayChangePct() {
  try {
    const pub = await fetchPublicNiftyIntraday();
    if (pub.ltp == null) return null;
    const change = computeNiftyDayChange(pub.ltp, pub.bars, pub.previousClose ?? null);
    return change?.percent != null && Number.isFinite(change.percent) ? change.percent : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} apiKey
 * @param {string} jwt
 * @param {string} symbol
 * @param {{ minConfidence?: number, minTargetPct?: number }} suggestFilters
 * @param {{ quote?: object, niftyChangePct?: number | null, now?: Date, scanSource?: string }} ctx
 */
async function analyzeOneSymbol(apiKey, jwt, symbol, suggestFilters, ctx) {
  const snap = await fetchEquitySnapshotCached(apiKey, jwt, symbol);
  const ltp = snap.ltp ?? 0;
  const quote = ltp > 0 ? computeEquityQuoteStats(snap.bars, ltp, snap.prevClose) : null;
  const analysis =
    ltp > 0
      ? analyzeEquityIntraday(snap.bars, ltp, suggestFilters, {
          quote,
          niftyChangePct: ctx.niftyChangePct ?? null,
          now: ctx.now,
        })
      : analyzeEquityIntraday([], 0, suggestFilters, { now: ctx.now });

  let dayChange = null;
  if (quote) {
    dayChange = {
      prevClose: quote.prevClose,
      points: quote.changePts,
      percent: quote.changePct,
    };
  } else if (snap.prevClose && ltp > 0) {
    const pts = ltp - snap.prevClose;
    const pct = (pts / snap.prevClose) * 100;
    dayChange = {
      prevClose: snap.prevClose,
      points: Math.round(pts * 100) / 100,
      percent: Math.round(pct * 100) / 100,
    };
  }

  const supportResistance =
    ltp > 0
      ? computeSupportResistance(snap.bars, ltp, quote, {
          vwap: analysis.vwap,
          prior15: analysis.prior15,
        })
      : null;

  return {
    symbol: snap.symbol,
    name: getEquityDisplayName(snap.symbol),
    ltp,
    source: snap.source,
    error: snap.error,
    dayChange,
    quote,
    barsCount: snap.bars?.length ?? 0,
    analysis,
    supportResistance,
    tradingsymbol: snap.tradingsymbol,
    scanSource: ctx.scanSource ?? 'watchlist',
  };
}

/**
 * Scan user's added stock list only; rank best intraday buys from that list.
 * @param {string} apiKey
 * @param {string} jwt
 * @param {string[]} [symbols]
 * @param {{ minConfidence?: number, minTargetPct?: number }} [filters]
 */
export async function analyzeWatchlist(apiKey, jwt, symbols, filters = {}) {
  const watchlist = symbols?.length ? symbols : readWatchlist();
  if (!watchlist.length) {
    return {
      stocks: [],
      ranked: [],
      topPick: null,
      analyzedAt: Date.now(),
      message: 'Add stocks to your list to run intraday purchase analysis',
    };
  }

  const now = new Date();
  const beforeOpeningRange = isBeforeOpeningRange(now);

  const minConfidence = filters.minConfidence ?? MIN_SUGGEST_CONFIDENCE_PCT;
  const minTargetPct = filters.minTargetPct ?? MIN_SUGGEST_TARGET_MOVE_PCT;
  const suggestFilters = { minConfidence, minTargetPct };

  const niftyChangePct = await fetchNiftyDayChangePct();

  const results = await mapPool(watchlist, SCAN_CONCURRENCY, (symbol) =>
    analyzeOneSymbol(apiKey, jwt, symbol, suggestFilters, {
      niftyChangePct,
      now,
      scanSource: 'watchlist',
    })
  );

  const ranked = rankByProfitPotential(results, suggestFilters);
  const topPick = ranked[0] ?? null;

  const scanMeta = {
    universeSize: watchlist.length,
    watchlistSize: watchlist.length,
    nifty50Size: 0,
    niftyChangePct,
    beforeOpeningRange,
  };

  let message;
  if (beforeOpeningRange) {
    message = 'Pre-opening scan — buy signals activate after 9:30 AM IST';
  } else if (ranked.length) {
    message = `${ranked.length} high-confluence pick${ranked.length === 1 ? '' : 's'} from your list — ${minConfidence}%+ confidence, ${minTargetPct}%+ target`;
  } else {
    message = `No high-confluence buy (${minConfidence}%+ confidence, ${minTargetPct}%+ target) in your ${watchlist.length} stock${watchlist.length === 1 ? '' : 's'} — wait for EMA trend + 15m breakout`;
  }

  return {
    stocks: results,
    ranked,
    topPick,
    analyzedAt: Date.now(),
    suggestFilters: { minConfidence, minTargetPct },
    scanMeta,
    message,
  };
}
