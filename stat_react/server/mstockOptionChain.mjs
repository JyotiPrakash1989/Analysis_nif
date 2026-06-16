/**
 * NIFTY option chain via mStock Type B (requires session JWT).
 * @see https://tradingapi.mstock.com/docs/v1/typeB/option-chain-apis/
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
  isMstockTypeBBlocked,
  MSTOCK_IP_MISMATCH,
  throwIfMstockIpError,
} from './mstockApiGuard.mjs';
import { fetchNiftyChainFromScripMaster } from './mstockScripMaster.mjs';

const NSE_EXCH = '2';
const NIFTY_UNDERLYING_TOKEN = '26000';

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function apiOk(json) {
  const st = json?.status;
  return (
    st === true ||
    st === 'true' ||
    st === 1 ||
    st === '1' ||
    String(st).toLowerCase() === 'true'
  );
}

/** @param {string} iso YYYY-MM-DD */
function expiryIsoToEpochSec(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return Math.floor(Date.UTC(y, m - 1, d, 10, 0, 0) / 1000);
}

/** @param {Record<string, number>} dctExp */
function pickExpiryEpoch(dctExp, targetIso) {
  const target = expiryIsoToEpochSec(targetIso);
  const epochs = Object.values(dctExp || {})
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 1e9);
  if (!epochs.length) return null;
  let best = epochs[0];
  let bestDiff = Math.abs(best - target);
  for (const e of epochs) {
    const diff = Math.abs(e - target);
    if (diff < bestDiff) {
      best = e;
      bestDiff = diff;
    }
  }
  return best;
}

/** @param {string} row e.g. "84549,112000,0" or "token,strike,ltp,..." */
function parseLegRow(row) {
  const parts = String(row).split(',');
  if (parts.length < 2) return null;
  const token = parts[0].trim();
  let strike = Number(parts[1]);
  if (!token || !Number.isFinite(strike)) return null;
  if (strike > 50_000) strike = Math.round(strike / 100);
  let ltp = null;
  for (let i = 2; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (Number.isFinite(n) && n > 0.05 && n < 500_000) {
      ltp = n > 5000 ? n / 100 : n;
      break;
    }
  }
  return { token, strike, ltp };
}

/**
 * @param {unknown} data
 * @returns {Map<number, { ceToken?: string, peToken?: string }>}
 */
function legsByStrike(data) {
  const map = new Map();
  for (const row of data?.call ?? []) {
    const leg = parseLegRow(row);
    if (!leg) continue;
    const cur = map.get(leg.strike) ?? {};
    cur.ceToken = leg.token;
    if (leg.ltp != null) cur.ceLtp = leg.ltp;
    map.set(leg.strike, cur);
  }
  for (const row of data?.put ?? []) {
    const leg = parseLegRow(row);
    if (!leg) continue;
    const cur = map.get(leg.strike) ?? {};
    cur.peToken = leg.token;
    if (leg.ltp != null) cur.peLtp = leg.ltp;
    map.set(leg.strike, cur);
  }
  return map;
}

async function getJson(path, apiKey, jwt) {
  const headers = {
    ...quoteHeaders(apiKey, jwt),
    'Content-Type': 'application/json',
  };
  const { statusCode, text } = await httpsGet(path, headers);
  if (statusCode === 401) {
    throw new Error('401 option chain: session expired — log in again with SMS OTP');
  }
  throwIfMstockIpError(statusCode, text);
  if (statusCode !== 200) {
    throw new Error(`option chain HTTP ${statusCode}: ${text.slice(0, 200)}`);
  }
  const json = parseJson(text);
  if (!apiOk(json)) {
    throw new Error(json?.message || 'option chain API failed');
  }
  return json?.data ?? json;
}

/**
 * @param {string} apiKey
 * @param {string} jwt
 * @param {number} spot
 * @returns {Promise<{ chain: object[], atm: number, expiryIso: string, source: string }>}
 */
export async function fetchMstockNiftyOptionChain(apiKey, jwt, spot) {
  const atm = atmStrike(spot, 50);
  const expiryIso = nearestNiftyWeeklyExpiry();

  if (!isMstockTypeBBlocked()) {
    try {
      return await fetchMstockNiftyOptionChainCore(apiKey, jwt, spot, atm, expiryIso);
    } catch (e) {
      try {
        const fromScrip = await fetchNiftyChainFromScripMaster(apiKey, jwt, spot);
        console.log('[NiftyOptima] Option chain via scrip master + LTP quote');
        return fromScrip;
      } catch (scripErr) {
        if (e?.code === MSTOCK_IP_MISMATCH) throw e;
        const msg = scripErr instanceof Error ? scripErr.message : String(scripErr);
        throw new Error(
          `${e instanceof Error ? e.message : String(e)} · scrip fallback: ${msg}`,
        );
      }
    }
  }

  try {
    const fromScrip = await fetchNiftyChainFromScripMaster(apiKey, jwt, spot);
    console.log('[NiftyOptima] Option chain via scrip master (after prior IP block)');
    return fromScrip;
  } catch (e) {
    const err = new Error(MSTOCK_IP_MISMATCH);
    err.code = MSTOCK_IP_MISMATCH;
    throw err;
  }
}

async function fetchMstockNiftyOptionChainCore(apiKey, jwt, spot, atm, expiryIso) {
  const master = await getJson(`/openapi/typeb/getoptionchainmaster/${NSE_EXCH}`, apiKey, jwt);
  clearMstockIpBlock();
  const expiryEpoch = pickExpiryEpoch(master?.dctExp, expiryIso);
  if (!expiryEpoch) {
    throw new Error('No expiry in option chain master');
  }

  const paths = [
    `/openapi/typeb/GetOptionChain/${NSE_EXCH}/${expiryEpoch}/${NIFTY_UNDERLYING_TOKEN}`,
    `/openapi/typeb/getoptionchainmaster/${NSE_EXCH}/${expiryEpoch}/${NIFTY_UNDERLYING_TOKEN}`,
  ];

  let chainData = null;
  let lastErr;
  for (const path of paths) {
    try {
      chainData = await getJson(path, apiKey, jwt);
      if (chainData?.call?.length || chainData?.put?.length) break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!chainData?.call?.length && !chainData?.put?.length) {
    throw lastErr || new Error('Empty NIFTY option chain from mStock');
  }

  const byStrike = legsByStrike(chainData);
  const strikes = [...byStrike.keys()].sort((a, b) => a - b);
  const minStrike = strikesFromSpot(spot, 50, 1)[0] ?? atm;
  const nearest = strikes.filter((s) => s >= minStrike).slice(0, OPTION_CHAIN_STRIKE_COUNT);

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
    const ceFromQuote = legs.ceToken ? ltps.get(legs.ceToken) : null;
    const peFromQuote = legs.peToken ? ltps.get(legs.peToken) : null;
    const ceLtp = ceFromQuote ?? legs.ceLtp ?? null;
    const peLtp = peFromQuote ?? legs.peLtp ?? null;
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
    throw new Error('Option chain legs found but no CE/PE LTP from quote');
  }

  return { chain, atm, expiryIso, source: 'mstock' };
}
