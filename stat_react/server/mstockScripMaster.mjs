/**
 * Build NIFTY option chain from OpenAPIScripMaster + batch LTP quote (Type B).
 * Fallback when GetOptionChain is blocked or unavailable.
 */

import { httpsGet } from './mstockHttps.mjs';
import { quoteHeaders, fetchNseTokenLtps } from './niftyQuote.mjs';
import {
  atmStrike,
  nearestNiftyWeeklyExpiry,
  OPTION_CHAIN_STRIKE_COUNT,
  strikesFromSpot,
} from './analysis.mjs';
import {
  clearMstockIpBlock,
  markMstockIpBlocked,
  throwIfMstockIpError,
} from './mstockApiGuard.mjs';

const SCRIP_PATH = '/openapi/typeb/instruments/OpenAPIScripMaster';

const MONTHS = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

/** @param {string} expiryIso YYYY-MM-DD */
function expiryIsoToDdMmmYy(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const mon = Object.keys(MONTHS).find((k) => MONTHS[k] === m) ?? 'JAN';
  return `${String(d).padStart(2, '0')}${mon}${String(y).slice(-2)}`;
}

/** NSE NIFTY index options lot (override via MSTOCK_NIFTY_LOT_SIZE). */
export function defaultNiftyLotSize() {
  const n = Number(process.env.MSTOCK_NIFTY_LOT_SIZE || 75);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 75;
}

/** @param {Record<string, unknown>} row */
export function parseInstrumentLotSize(row) {
  const raw =
    row.lotsize ?? row.lot_size ?? row.LotSize ?? row.lotSize ?? row['lot size'] ?? '';
  const n = Number(String(raw).replace(/,/g, ''));
  if (Number.isFinite(n) && n >= 1 && n <= 1000) return Math.round(n);
  return defaultNiftyLotSize();
}

/** Broker tradingsymbol for place-order (full option name, not underlying only). */
export function resolveTradingsymbol(row) {
  const candidates = [
    row.tradingsymbol,
    row.trading_symbol,
    row.TradingSymbol,
    row.name,
    row.symbol,
  ]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);
  const optionLeg = candidates.find((c) => /(CE|PE)$/i.test(c));
  return optionLeg || candidates[0] || '';
}

/** @param {Record<string, unknown>} row */
function normalizeInstrument(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    lotsize: String(parseInstrumentLotSize(row)),
    tradingsymbol: resolveTradingsymbol(row),
  };
}

/** @param {unknown} raw */
function parseInstruments(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const t = raw.trim();
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t);
      return Array.isArray(arr) ? arr.map((row) => normalizeInstrument(row)) : [];
    } catch {
      return [];
    }
  }
  const rows = [];
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return rows;
  const header = lines[0].toLowerCase();
  const sep = header.includes('\t') ? '\t' : ',';
  const cols = lines[0].split(sep).map((c) => c.trim().toLowerCase());
  const idx = (...names) => {
    for (const name of names) {
      const j = cols.indexOf(name.toLowerCase());
      if (j >= 0) return j;
    }
    return -1;
  };
  const get = (parts, ...names) => {
    const j = idx(...names);
    return j >= 0 ? parts[j]?.trim() : '';
  };
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep);
    rows.push(
      normalizeInstrument({
        token: get(parts, 'token'),
        symbol: get(parts, 'symbol'),
        name: get(parts, 'name'),
        expiry: get(parts, 'expiry'),
        strike: get(parts, 'strike'),
        lotsize: get(parts, 'lotsize', 'lot_size'),
        tradingsymbol: get(parts, 'tradingsymbol', 'trading_symbol', 'tradingsym'),
        instrumenttype: get(parts, 'instrumenttype', 'instrument_type'),
        exch_seg: get(parts, 'exch_seg', 'exchange', 'segment'),
      })
    );
  }
  return rows;
}

function isNiftyOption(row) {
  const sym = String(row.symbol ?? '').toUpperCase();
  const name = String(row.name ?? '').toUpperCase();
  const type = String(row.instrumenttype ?? '').toUpperCase();
  const seg = String(row.exch_seg ?? '').toUpperCase();
  if (!sym.includes('NIFTY') && !name.includes('NIFTY')) return false;
  if (type && !type.includes('OPT')) return false;
  if (seg && !/NFO|NSE|FO|BFO/.test(seg)) return false;
  return /CE|PE/.test(name) || /CE|PE/.test(sym);
}

function parseStrike(row) {
  let strike = Number(row.strike);
  if (Number.isFinite(strike) && strike > 0) {
    if (strike > 50_000) strike = Math.round(strike / 100);
    return strike;
  }
  const name = String(row.name ?? row.symbol ?? '').toUpperCase();
  const m = name.match(/(\d{4,5})(CE|PE)$/);
  if (m) return Number(m[1]);
  return null;
}

function isCe(row) {
  const name = String(row.name ?? row.symbol ?? '').toUpperCase();
  return name.endsWith('CE');
}

function isPe(row) {
  const name = String(row.name ?? row.symbol ?? '').toUpperCase();
  return name.endsWith('PE');
}

/** @param {string} expiryField @param {string} expiryIso */
function expiryMatches(expiryField, expiryIso) {
  const tag = expiryIsoToDdMmmYy(expiryIso);
  if (!tag) return true;
  const e = String(expiryField ?? '').toUpperCase().replace(/\s/g, '');
  const name = String(expiryField ?? '').toUpperCase();
  if (e.includes(tag)) return true;
  const [y, m, d] = expiryIso.split('-');
  const mon = Object.keys(MONTHS).find((k) => MONTHS[k] === Number(m));
  if (mon && e.includes(`${d}${mon}`)) return true;
  return false;
}

/**
 * @param {string} apiKey
 * @param {string} jwt
 * @param {number} spot
 */
export async function fetchNiftyChainFromScripMaster(apiKey, jwt, spot) {
  const headers = quoteHeaders(apiKey, jwt);
  const { statusCode, text } = await httpsGet(SCRIP_PATH, headers);
  if (statusCode === 200) clearMstockIpBlock();
  throwIfMstockIpError(statusCode, text);
  if (statusCode !== 200) {
    throw new Error(`scrip master HTTP ${statusCode}: ${text.slice(0, 160)}`);
  }

  const instruments = parseInstruments(text);
  const expiryIso = nearestNiftyWeeklyExpiry();
  const atm = atmStrike(spot, 50);
  const minStrike = strikesFromSpot(spot, 50, 1)[0] ?? atm;
  const byStrike = new Map();

  for (const row of instruments) {
    if (!isNiftyOption(row)) continue;
    if (!expiryMatches(row.expiry || row.name, expiryIso)) continue;
    const strike = parseStrike(row);
    if (strike == null) continue;
    if (strike < minStrike) continue;

    const cur = byStrike.get(strike) ?? {};
    const token = String(row.token ?? '').trim();
    if (!token) continue;
    if (isCe(row)) cur.ceToken = token;
    if (isPe(row)) cur.peToken = token;
    byStrike.set(strike, cur);
  }

  const strikes = [...byStrike.keys()]
    .filter((s) => {
      const l = byStrike.get(s);
      return l?.ceToken || l?.peToken;
    })
    .sort((a, b) => a - b);

  const nearest = strikes.filter((s) => s >= minStrike).slice(0, OPTION_CHAIN_STRIKE_COUNT);

  if (!nearest.length) {
    throw new Error('No NIFTY option legs in scrip master for this expiry');
  }

  const tokens = [];
  for (const strike of nearest) {
    const legs = byStrike.get(strike);
    if (legs?.ceToken) tokens.push(legs.ceToken);
    if (legs?.peToken) tokens.push(legs.peToken);
  }

  const ltps = await fetchNseTokenLtps(apiKey, jwt, tokens);
  if (ltps.size > 0) clearMstockIpBlock();

  const chain = nearest.map((strike) => {
    const legs = byStrike.get(strike) ?? {};
    const ceLtp = legs.ceToken ? ltps.get(legs.ceToken) : null;
    const peLtp = legs.peToken ? ltps.get(legs.peToken) : null;
    return {
      strike,
      ce: {
        ltp: ceLtp != null ? Math.round(ceLtp * 100) / 100 : 0,
        oiChangePct: 0,
        volume: 0,
      },
      pe: {
        ltp: peLtp != null ? Math.round(peLtp * 100) / 100 : 0,
        oiChangePct: 0,
        volume: 0,
      },
    };
  });

  const withLtp = chain.filter((r) => r.ce.ltp > 0 || r.pe.ltp > 0).length;
  if (!withLtp) {
    throw new Error('Scrip master found legs but LTP quote returned no prices');
  }

  return { chain, atm, expiryIso, source: 'mstock' };
}

let scripInstrumentsCache = { at: 0, rows: [] };

/** @param {string} apiKey @param {string} jwt */
async function loadScripInstruments(apiKey, jwt) {
  const maxAge = Number(process.env.MSTOCK_SCRIP_CACHE_MS || 300_000);
  if (scripInstrumentsCache.rows.length && Date.now() - scripInstrumentsCache.at < maxAge) {
    return scripInstrumentsCache.rows;
  }
  const headers = quoteHeaders(apiKey, jwt);
  const { statusCode, text } = await httpsGet(SCRIP_PATH, headers);
  if (statusCode === 200) clearMstockIpBlock();
  throwIfMstockIpError(statusCode, text);
  if (statusCode !== 200) {
    throw new Error(`scrip master HTTP ${statusCode}: ${text.slice(0, 160)}`);
  }
  const rows = parseInstruments(text);
  scripInstrumentsCache = { at: Date.now(), rows };
  return rows;
}

/**
 * Resolve NIFTY weekly option leg for place-order (tradingsymbol + token).
 * @param {string} apiKey
 * @param {string} jwt
 * @param {number} strike
 * @param {'CE'|'PE'} optionType
 */
export async function findNiftyOptionInstrument(apiKey, jwt, strike, optionType) {
  const instruments = await loadScripInstruments(apiKey, jwt);
  const expiryIso = nearestNiftyWeeklyExpiry();
  const wantCe = optionType === 'CE';
  for (const row of instruments) {
    if (!isNiftyOption(row)) continue;
    if (!expiryMatches(row.expiry || row.name, expiryIso)) continue;
    const s = parseStrike(row);
    if (s !== strike) continue;
    if (wantCe && !isCe(row)) continue;
    if (!wantCe && !isPe(row)) continue;
    const seg = String(row.exch_seg ?? 'NFO').toUpperCase();
    const exchange = /BFO/.test(seg) ? 'BFO' : 'NFO';
    const tradingsymbol = resolveTradingsymbol(row);
    const symboltoken = String(row.token ?? '').trim();
    const lotsize = parseInstrumentLotSize(row);
    if (!tradingsymbol || !symboltoken) continue;
    if (!/(CE|PE)$/i.test(tradingsymbol)) continue;
    return { tradingsymbol, symboltoken, exchange, lotsize };
  }
  return null;
}
