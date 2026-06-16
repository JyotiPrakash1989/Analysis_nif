import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  atmStrike,
  evaluateBreakoutContext,
  getOptionChainForSpot,
  mergeStrategyRules,
  nearestNiftyWeeklyExpiry,
  normalizeOptionChainRows,
  pickBarsForStrategy,
} from './analysis.mjs';
import { resolveDailyBestBuy } from './dailyBestBuy.mjs';
import { getNiftyTradingSettings, setNiftyTradingSettings } from './niftyTradingSettings.mjs';
import { areIntradayBarsStale } from './barFreshness.mjs';
import { MockNiftyFeed } from './feedEngine.mjs';
import {
  autoBuyOnSignal,
  checkPositionExits,
  isAutoTradingEnabled,
  resetDailyAutoKeys,
  setAutoTradingEnabled,
} from './autoTrader.mjs';
import {
  appendOrderLog,
  clearDayLogs,
  dayLogsToCsv,
  istDayKey,
  openNiftyPositionsFromLogs,
  openPositionsFromLogs,
  readDayLogs,
} from './orderLog.mjs';
import { cancelOrder, placeBuyWithExits, placeOrder } from './placeOrder.mjs';
import {
  computeNiftyDayChange,
  fetchNiftyIndexLtp,
  fetchNifty1mBars,
  fetchNiftyDailyBars,
  quoteHeaders,
} from './niftyQuote.mjs';
import { httpsGet } from './mstockHttps.mjs';
import { LiveIntradayBars } from './niftyIntradayBars.mjs';
import { fetchPublicNiftyIntraday } from './publicNiftySpot.mjs';
import { formatPublicIndexNote } from './indexMeta.mjs';
import { mstockConnectLogin, mstockVerifyTotp } from './mstockAuth.mjs';
import { establishMstockSession } from './mstockSession.mjs';
import { bootstrapMstockJwt, buildWsUrlOverride } from './mstockJwtBootstrap.mjs';
import { generateTotpCode, normalizeTotpSecret } from './mstockTotp.mjs';
import { extractJwtFromWsUrl, resolveMstockBroadcastWsUrl } from './mstockWsConfig.mjs';
import { startMstockBroadcastWs } from './mstockBroadcastWs.mjs';
import {
  formatMstockApiMessage,
  formatMstockAuthHelp,
  hasMstockSessionJwt,
  isMstockAuthError,
  isMstockResponseOk,
  mstockJwtRequiredMessage,
} from './mstockErrors.mjs';
import { mergeOrderBookIntoLogs } from './mstockOrderReconcile.mjs';
import { fetchMstockNiftyOptionChain } from './mstockOptionChain.mjs';
import {
  addToWatchlist,
  normalizeSymbol,
  readWatchlist,
  removeFromWatchlist,
  writeWatchlist,
} from './equityWatchlist.mjs';
import { analyzeEquityIntraday, stockMeetsSuggestFilters } from './equityAnalysis.mjs';
import { analyzeWatchlist, fetchEquitySnapshot } from './equityQuotes.mjs';
import {
  isEquityAutoTradingEnabled,
  processEquityWatchlist,
  resetEquityAutoKeys,
  setEquityAutoTradingEnabled,
} from './equityAutoTrader.mjs';
import { searchEquitySymbols } from './equitySymbolSearch.mjs';
import { placeEquityBuyWithExits } from './equityPlaceOrder.mjs';
import { buildEquityExitLogRows } from './equityOrderLog.mjs';
import { checkEquityPositionExits, resetEquityExitKeys } from './equityPositionMonitor.mjs';
import {
  getEquitySuggestSettings,
  setEquitySuggestSettings,
} from './equitySuggestSettings.mjs';
import {
  appendNiftySuggestion,
  clearNiftySuggestions,
  readEquitySuggestions,
  readNiftySuggestions,
} from './suggestionLog.mjs';
import { signalWindowKey } from './dailyBestBuy.mjs';
import {
  clearMstockIpBlock,
  getMstockTypeBBlockMessage,
  isMstockIpMismatch,
  isMstockTypeBBlocked,
  mstockIpWhitelistUiHint,
  logMstockIpBlockOnce,
  logMstockOptionChainWarn,
  markMstockIpBlocked,
  MSTOCK_IP_MISMATCH,
  resetOptionChainThrottle,
  shouldAttemptOptionChainFetch,
} from './mstockApiGuard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repo root (Nif/.env) then stat_react/.env — later files override.
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: true });

const CLOUD_PORT = process.env.PORT ? Number(process.env.PORT) : null;
const DESIRED_PORT = CLOUD_PORT ?? Number(process.env.NIFTYOPTIMA_PORT || process.env.PROXY_PORT || 3200);
const STRICT_PORT = process.env.NIFTYOPTIMA_STRICT_PORT === '1';
const PORT_FALLBACK_MAX = Number(process.env.NIFTYOPTIMA_PORT_FALLBACK_MAX || 30);
const MSTOCK = 'https://api.mstock.trade';
const API_KEY = (process.env.MSTOCK_API_KEY || process.env.VITE_MSTOCK_API_KEY || '')
  .trim()
  .replace(/^\uFEFF/, '');
let jwtToken = (process.env.MSTOCK_JWT_TOKEN || process.env.VITE_MSTOCK_JWT_TOKEN || '').trim();
let mstockWsUrlOverride = (process.env.MSTOCK_WS_URL || '').trim();

function getMstockWsUrl() {
  if (mstockWsUrlOverride) return mstockWsUrlOverride;
  return resolveMstockBroadcastWsUrl({
    ...process.env,
    MSTOCK_JWT_TOKEN: jwtToken,
    MSTOCK_WS_URL: '',
  });
}

function applyAccessToken(accessToken) {
  jwtToken = accessToken;
  mstockWsUrlOverride = buildWsUrlOverride(process.env, accessToken);
  if (mstockWsClient) {
    mstockWsClient.stop();
    mstockWsClient = null;
  }
  startMstockWsFeed();
}

function useAutoTotp() {
  const v = process.env.MSTOCK_USE_TOTP;
  return v === '1' || v === 'true' || v === 'on';
}

/** Optional server-side TOTP/OTP env only when MSTOCK_USE_TOTP=1. UI OTP is default. */
/** @returns {Promise<boolean>} */
async function bootstrapJwt(force = false) {
  if (jwtToken && !force) return true;
  if (!useAutoTotp() || mstockTotpDisabled) return Boolean(jwtToken);
  try {
    const result = await bootstrapMstockJwt(process.env, { existingJwt: jwtToken, force });
    if (result?.accessToken) {
      applyAccessToken(result.accessToken);
      console.log(`[NiftyOptima] MSTOCK_JWT_TOKEN from ${result.source} (valid until midnight)`);
      return true;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e?.code === 'TOTP_NOT_ENABLED' || /totp.*not enabled/i.test(msg)) {
      mstockTotpDisabled = true;
      console.warn(`[NiftyOptima] ${msg}`);
      return false;
    }
    console.warn('[NiftyOptima] JWT bootstrap failed:', msg);
  }
  return Boolean(jwtToken);
}

function scheduleTotpJwtRefresh() {
  if (mstockTotpDisabled) return;
  if (!useAutoTotp() || !normalizeTotpSecret(process.env.MSTOCK_TOTP_SECRET || '') || !API_KEY) return;
  const ms = Number(process.env.MSTOCK_TOTP_REFRESH_MS || 6 * 60 * 60 * 1000);
  setInterval(() => {
    void bootstrapJwt(true).then(() => startMstockWsFeed());
  }, ms);
}

const initialWsUrl = resolveMstockBroadcastWsUrl(process.env);
if (!jwtToken && initialWsUrl) {
  jwtToken = extractJwtFromWsUrl(initialWsUrl);
}

let lastWsLtpAt = 0;
/** @type {{ stop: () => void } | null} */
let mstockWsClient = null;
/** Cached for UI when mStock returns IA403. */
let cachedPublicIp = null;

async function refreshCachedPublicIp() {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (j?.ip) cachedPublicIp = String(j.ip);
  } catch {
    /* ignore */
  }
}

function stopMstockWsFeed() {
  if (mstockWsClient) {
    mstockWsClient.stop();
    mstockWsClient = null;
  }
}
/** mStock account rejected verifytotp — do not retry TOTP until restart. */
let mstockTotpDisabled = false;

/** Live option chain cache (mStock Type B). */
let mstockChainCache = {
  spot: 0,
  atm: 0,
  chain: [],
  expiry: '',
  fetchedAt: 0,
  source: 'sim',
};

function getBearer() {
  return jwtToken || API_KEY;
}

function buildAuthHeader(apiKey, bearer) {
  const token = typeof bearer === 'string' ? bearer.trim() : '';
  return hasMstockSessionJwt(token, apiKey) ? `Bearer ${token}` : `Bearer ${token || apiKey}`;
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

/** Type B quote forward (legacy path) — keys stay server-side. */
function forwardMstock(path, body, res) {
  const url = `${MSTOCK}${path}`;
  const headers = {
    'X-Mirae-Version': '1',
    Authorization: buildAuthHeader(API_KEY, getBearer()),
    'X-PrivateKey': API_KEY,
    'Content-Type': 'application/json',
  };
  fetch(url, { method: 'POST', headers, body })
    .then((r) => r.text())
    .then((text) => {
      res.status(200).type('application/json').send(text);
    })
    .catch((e) => {
      res.status(502).json({ status: false, message: e.message });
    });
}

app.get('/api/mstock/auth-status', (_req, res) => {
  const key = API_KEY;
  res.json({
    hasApiKey: Boolean(key),
    authenticated: Boolean(jwtToken),
    needsOtp: Boolean(key && !jwtToken),
    apiKeySuffix: key.length >= 4 ? key.slice(-4) : '',
    ipBlocked: isMstockTypeBBlocked(),
    ipBlockMessage: getMstockTypeBBlockMessage(),
    whitelistIp: cachedPublicIp,
  });
});

/** Pre-fill login form from server .env (local dev only). */
app.get('/api/mstock/login-hints', (_req, res) => {
  res.json({
    username: String(process.env.MSTOCK_USERNAME || '').trim(),
    password: String(process.env.MSTOCK_PASSWORD || '').trim(),
    hasApiKey: Boolean(API_KEY),
  });
});

/** Public IP to whitelist on trade.mstock.com → Trading APIs. */
app.get('/api/mstock/my-ip', async (_req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (j?.ip) cachedPublicIp = String(j.ip);
    return res.json({
      ip: j?.ip ?? null,
      hint: 'Add this as Primary IP on your mStock API key (trade.mstock.com → Trading APIs).',
    });
  } catch (e) {
    return res.status(502).json({
      ip: null,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

app.post('/api/mstock/request-otp', async (req, res) => {
  const username = String(req.body?.username || process.env.MSTOCK_USERNAME || '').trim();
  const password = String(req.body?.password || process.env.MSTOCK_PASSWORD || '').trim();
  if (!username || !password) {
    return res.status(400).json({
      status: false,
      message: 'username and password required to send OTP',
    });
  }
  try {
    await mstockConnectLogin(username, password);
    return res.json({
      status: true,
      message: 'OTP sent to registered mobile. Enter it to continue.',
    });
  } catch (e) {
    return res.status(401).json({
      status: false,
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

app.post('/api/mstock/quote', (req, res) => {
  if (!API_KEY) return res.status(500).json({ status: false, message: 'MSTOCK_API_KEY not set' });
  forwardMstock('/openapi/typeb/instruments/quote', JSON.stringify(req.body || { mode: 'LTP', exchangeTokens: { NSE: ['999260'] } }), res);
});

app.post('/api/mstock/historical', (req, res) => {
  if (!API_KEY) return res.status(500).json({ status: false, message: 'MSTOCK_API_KEY not set' });
  forwardMstock('/openapi/typeb/instruments/historical', JSON.stringify(req.body || {}), res);
});

app.post('/api/mstock/session-token', async (req, res) => {
  if (!API_KEY) return res.status(500).json({ status: false, message: 'MSTOCK_API_KEY not set' });
  const requestToken = String(req.body?.requestToken || req.body?.otp || '').trim();
  const checksum = String(req.body?.checksum || process.env.MSTOCK_CHECKSUM || 'L').trim();
  if (!requestToken) {
    return res.status(400).json({
      status: false,
      message: 'SMS OTP (requestToken) required',
    });
  }

  try {
    const result = await establishMstockSession(API_KEY, requestToken, checksum);
    applyAccessToken(result.accessToken);
    startMstockWsFeed();
    const sync = await syncMstockSessionData();
    return res.json({
      status: true,
      message: 'Session connected',
      barsLoaded: sync.barsCount,
      optionChainLive: sync.optionChainLive,
      source: result.source,
      expires: 'midnight (same day)',
      wsEnabled: Boolean(getMstockWsUrl()),
    });
  } catch (e) {
    const err = e;
    return res.status(401).json({
      status: false,
      message: err instanceof Error ? err.message : String(err),
      hint: err.hint || undefined,
      code: err.code || undefined,
    });
  }
});

app.post('/api/mstock/verify-totp', async (req, res) => {
  if (!API_KEY) return res.status(500).json({ status: false, message: 'MSTOCK_API_KEY not set' });
  const secret = normalizeTotpSecret(process.env.MSTOCK_TOTP_SECRET || '');
  let totp = String(req.body?.totp || '').trim();
  if (!totp) {
    if (!secret) {
      return res.status(400).json({
        status: false,
        message: 'Set MSTOCK_TOTP_SECRET in .env or pass { "totp": "123456" }',
      });
    }
    try {
      totp = generateTotpCode(secret);
    } catch (e) {
      return res.status(400).json({
        status: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  try {
    const { accessToken } = await mstockVerifyTotp(API_KEY, totp);
    applyAccessToken(accessToken);
    startMstockWsFeed();
    const sync = await syncMstockSessionData();
    return res.json({
      status: true,
      message: 'Session token from verifytotp',
      barsLoaded: sync.barsCount,
      optionChainLive: sync.optionChainLive,
      source: 'https://api.mstock.trade/openapi/typea/session/verifytotp',
      expires: 'midnight (same day)',
      wsEnabled: Boolean(getMstockWsUrl()),
    });
  } catch (e) {
    return res.status(401).json({
      status: false,
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

app.post('/api/place-order', async (req, res) => {
  const body = { ...(req.body || {}), requireBroker: true };
  const sessionJwt =
    String(body.jwt ?? body.accessToken ?? body.mstockJwt ?? '').trim() || jwtToken;
  const isSell = String(body.transactiontype || 'BUY').toUpperCase() === 'SELL';
  const out = isSell
    ? await placeOrder(body, { apiKey: API_KEY, jwt: sessionJwt })
    : await placeBuyWithExits(body, { apiKey: API_KEY, jwt: sessionJwt });
  const mode = body.mode === 'auto' ? 'auto' : 'manual';
  const trigger = body.trigger || 'manual';
  const buy = isSell ? out : (out.buy ?? out);
  const dayKey = istDayKey();
  const orderLogs = [];

  if (buy.ok && buy.orderId) {
    orderLogs.push(
      appendOrderLog({
        dayKey,
        ts: Date.now(),
        action: isSell ? 'SELL' : 'BUY',
        mode,
        trigger: isSell ? trigger : 'manual',
        parentBuyId: body.parentBuyId,
        strike: buy.strike ?? body.strike,
        optionType: buy.optionType ?? body.optionType,
        lots: buy.lots ?? body.quantity,
        units: buy.brokerQuantity,
        lotsize: buy.lotsize,
        entry: buy.entry ?? body.entry,
        sl: buy.sl ?? body.sl,
        tgt: buy.tgt ?? body.tgt,
        ltp: buy.entry ?? body.entry,
        orderId: buy.orderId,
        mock: buy.mock,
        status: buy.ok
          ? buy.mock
            ? 'simulated'
            : isSell
              ? 'submitted'
              : mode === 'auto'
                ? 'open'
                : 'submitted'
          : 'failed',
        message: buy.message,
        tradingsymbol: buy.tradingsymbol,
        exchange: buy.exchange,
      })
    );
  }

  if (!isSell && buy.ok && buy.broker === true && !buy.mock && out.targetSell?.ok) {
    const ts = out.targetSell;
    orderLogs.push(
      appendOrderLog({
      dayKey,
      ts: Date.now(),
      action: 'SELL',
      mode,
      trigger: 'target',
      parentBuyId: buy.orderId,
      strike: buy.strike ?? body.strike,
      optionType: buy.optionType ?? body.optionType,
      lots: ts.lots ?? buy.lots,
      units: ts.brokerQuantity,
      lotsize: ts.lotsize,
      entry: buy.entry ?? body.entry,
      sl: buy.sl ?? body.sl,
      tgt: buy.tgt ?? body.tgt,
      exitPrice: buy.tgt ?? body.tgt,
      orderId: ts.orderId,
      mock: ts.mock,
      status: ts.ok ? (ts.mock ? 'target_pending' : 'submitted') : 'failed',
      message: ts.ok
        ? `Target sell LIMIT @ ${Number(buy.tgt ?? body.tgt).toFixed(2)}`
        : ts.message || 'Target sell placement failed',
      tradingsymbol: ts.tradingsymbol,
      exchange: ts.exchange,
      })
    );
  }

  if (!isSell && buy.ok && buy.broker === true && !buy.mock && out.stopLossSell?.ok) {
    const slOrder = out.stopLossSell;
    orderLogs.push(
      appendOrderLog({
      dayKey,
      ts: Date.now(),
      action: 'SELL',
      mode,
      trigger: 'stoploss',
      parentBuyId: buy.orderId,
      strike: buy.strike ?? body.strike,
      optionType: buy.optionType ?? body.optionType,
      lots: slOrder.lots ?? buy.lots,
      units: slOrder.brokerQuantity,
      lotsize: slOrder.lotsize,
      entry: buy.entry ?? body.entry,
      sl: buy.sl ?? body.sl,
      tgt: buy.tgt ?? body.tgt,
      exitPrice: buy.sl ?? body.sl,
      orderId: slOrder.orderId,
      mock: slOrder.mock,
      status: slOrder.ok ? 'submitted' : 'failed',
      message: slOrder.ok
        ? `Stop-loss sell STOPLOSS_LIMIT @ ${Number(buy.sl ?? body.sl).toFixed(2)}`
        : slOrder.message || 'Stop-loss sell placement failed',
      tradingsymbol: slOrder.tradingsymbol,
      exchange: slOrder.exchange,
      })
    );
  }

  for (const log of orderLogs) {
    io.emit('orderLog', log);
  }

  res.status(buy.status || (buy.ok ? 200 : 400)).json({
    ...buy,
    targetSellOrderId: out.targetSellOrderId,
    targetSellOk: out.targetSellOk,
    stopLossSellOrderId: out.stopLossSellOrderId,
    stopLossSellOk: out.stopLossSellOk,
    bracketStoploss: buy.bracketStoploss,
    bracketSquareoff: buy.bracketSquareoff,
    mode,
  });
});

app.get('/api/trading/settings', (_req, res) => {
  res.json({ autoTrading: isAutoTradingEnabled(), ...getNiftyTradingSettings() });
});

app.post('/api/trading/settings', (req, res) => {
  const body = req.body ?? {};
  if (body.autoTrading != null) {
    setAutoTradingEnabled(Boolean(body.autoTrading));
  }
  if (body.minDailyScore != null) {
    setNiftyTradingSettings({ minDailyScore: body.minDailyScore });
  }
  res.json({ autoTrading: isAutoTradingEnabled(), ...getNiftyTradingSettings() });
});

app.get('/api/equity/trading/settings', (_req, res) => {
  res.json({
    autoTrading: isEquityAutoTradingEnabled(),
    ...getEquitySuggestSettings(),
  });
});

app.post('/api/equity/trading/settings', (req, res) => {
  const body = req.body ?? {};
  if (body.autoTrading != null) {
    setEquityAutoTradingEnabled(Boolean(body.autoTrading));
  }
  if (body.minConfidence != null || body.minTargetPct != null) {
    setEquitySuggestSettings({
      minConfidence: body.minConfidence,
      minTargetPct: body.minTargetPct,
    });
  }
  res.json({
    autoTrading: isEquityAutoTradingEnabled(),
    ...getEquitySuggestSettings(),
  });
});

/** Manual equity buy from Stocks tab (default qty 1). */
app.post('/api/equity/place-order', async (req, res) => {
  const body = req.body || {};
  const symbol = String(body.symbol ?? '').trim().toUpperCase();
  const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
  const entry = Number(body.entry);
  let sl = Number(body.sl);
  let tgt = Number(body.tgt);
  if (!symbol) return res.status(400).json({ ok: false, message: 'symbol required' });
  if (!Number.isFinite(entry) || entry <= 0) {
    return res.status(400).json({ ok: false, message: 'entry price required' });
  }
  if (!Number.isFinite(sl) || sl <= 0 || sl >= entry) {
    sl = Math.round(entry * 0.992 * 100) / 100;
  }
  if (!Number.isFinite(tgt) || tgt <= entry) {
    tgt = Math.round((entry + (entry - sl) * 2) * 100) / 100;
  }

  const suggestFilters = getEquitySuggestSettings();
  try {
    const snap = await fetchEquitySnapshot(API_KEY, jwtToken, symbol);
    const ltp = snap.ltp > 0 ? snap.ltp : entry;
    const analysis = analyzeEquityIntraday(snap.bars ?? [], ltp, suggestFilters);
    const stock = { symbol, ltp, analysis };
    if (!stockMeetsSuggestFilters(stock, suggestFilters)) {
      const { minConfidence, minTargetPct } = suggestFilters;
      return res.status(400).json({
        ok: false,
        message:
          `Buy blocked — needs ${minConfidence}%+ confidence and ${minTargetPct}%+ target. ${analysis.rationale || ''}`,
      });
    }
  } catch (e) {
    return res.status(400).json({
      ok: false,
      message: e instanceof Error ? e.message : 'Could not verify stock against suggest filters',
    });
  }

  const out = await placeEquityBuyWithExits(
    { symbol, quantity, entry, sl, tgt },
    { apiKey: API_KEY, jwt: jwtToken }
  );
  const buy = out.buy ?? out;
  const dayKey = istDayKey();
  const logRow = appendOrderLog({
    dayKey,
    ts: Date.now(),
    assetType: 'equity',
    equitySymbol: symbol,
    action: 'BUY',
    mode: 'manual',
    trigger: 'buy_now',
    optionType: 'EQ',
    strike: 0,
    lots: 1,
    units: quantity,
    lotsize: 1,
    entry,
    sl: Number.isFinite(sl) ? sl : 0,
    tgt: Number.isFinite(tgt) ? tgt : 0,
    ltp: entry,
    orderId: buy.orderId,
    mock: buy.mock,
    status: buy.ok ? (buy.mock ? 'simulated' : 'open') : 'failed',
    message: buy.message || (buy.ok ? 'Manual buy now' : 'Buy failed'),
    tradingsymbol: buy.tradingsymbol,
    exchange: buy.exchange,
  });
  io.emit('equityOrderLog', logRow);
  io.emit('orderLog', logRow);

  const exitLogs = buy.ok
    ? buildEquityExitLogRows({
        dayKey,
        symbol,
        buy,
        out,
        mode: 'manual',
        entry,
        sl: Number.isFinite(sl) ? sl : 0,
        tgt: Number.isFinite(tgt) ? tgt : 0,
      })
    : [];
  for (const row of exitLogs) {
    const saved = appendOrderLog(row);
    io.emit('equityOrderLog', saved);
    io.emit('orderLog', saved);
  }

  res.status(buy.ok ? 200 : 400).json({
    ok: buy.ok,
    order: buy,
    log: logRow,
    exitLogs,
    targetSell: out.targetSell,
    stopLossSell: out.stopLossSell,
    targetSellOk: out.targetSellOk,
    stopLossSellOk: out.stopLossSellOk,
    exitsPlaced: out.exitsPlaced,
    message: buy.message,
  });
});

app.get('/api/orders/log', async (req, res) => {
  const day = String(req.query?.day || istDayKey());
  let logs = readDayLogs(day);
  if (hasMstockSessionJwt(jwtToken, API_KEY)) {
    try {
      const headers = quoteHeaders(API_KEY, jwtToken);
      const { statusCode, text } = await httpsGet('/openapi/typeb/orders', headers);
      if (statusCode === 200) {
        const json = JSON.parse(text);
        if (isMstockResponseOk(json)) {
          const rows = Array.isArray(json?.data ?? json?.Data) ? json.data ?? json.Data : [];
          logs = mergeOrderBookIntoLogs(logs, rows, day);
        }
      }
    } catch {
      /* keep stored logs */
    }
  }
  res.json({ day, logs, autoTrading: isAutoTradingEnabled() });
});

app.get('/api/suggestions/nifty', (req, res) => {
  const day = String(req.query?.day || istDayKey());
  res.json({ day, assetType: 'nifty', suggestions: readNiftySuggestions(day) });
});

app.delete('/api/suggestions/nifty', (req, res) => {
  const day = String(req.query?.day || req.body?.day || istDayKey());
  clearNiftySuggestions(day);
  res.json({ ok: true, day, assetType: 'nifty', suggestions: [] });
});

app.get('/api/suggestions/equity', (req, res) => {
  const day = String(req.query?.day || istDayKey());
  res.json({ day, assetType: 'equity', suggestions: readEquitySuggestions(day) });
});

app.delete('/api/orders/log', (req, res) => {
  const day = String(req.query?.day || req.body?.day || istDayKey());
  clearDayLogs(day);
  resetDailyAutoKeys(day);
  resetEquityAutoKeys(day);
  resetEquityExitKeys(day);
  if (day === istDayKey()) {
    dailyBuyState = {
      dayKey: '',
      emittedKeys: [],
      signalsToday: 0,
      lastSignal: null,
      ceScore: 0,
      peScore: 0,
    };
    lastEmittedDailySignalKey = '';
  }
  res.json({ ok: true, day, logs: [] });
});

app.get('/api/orders/export', (req, res) => {
  const day = String(req.query?.day || istDayKey());
  const csv = dayLogsToCsv(day);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="niftyoptima-orders-${day}.csv"`);
  res.send(csv);
});

app.post('/api/cancel-order', async (req, res) => {
  const orderId = req.body?.orderId ?? req.body?.orderid;
  const out = await cancelOrder(orderId, { apiKey: API_KEY, jwt: jwtToken }, {
    variety: req.body?.variety,
  });
  res.status(out.status || (out.ok ? 200 : 400)).json(out);
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'niftyoptima', ts: Date.now() });
});

/** mStock order book via PC IP (mobile passes JWT in query). */
app.get('/api/mstock/orders', async (req, res) => {
  const sessionJwt =
    String(req.query.jwt ?? req.query.accessToken ?? '').trim() || jwtToken;
  if (!hasMstockSessionJwt(sessionJwt, API_KEY)) {
    return res.status(401).json({
      ok: false,
      orders: [],
      message: mstockJwtRequiredMessage(process.env, { totpDisabled: mstockTotpDisabled }),
    });
  }
  try {
    const headers = quoteHeaders(API_KEY, sessionJwt);
    const { statusCode, text } = await httpsGet('/openapi/typeb/orders', headers);
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(502).json({
        ok: false,
        orders: [],
        message: `Broker response not JSON (HTTP ${statusCode})`,
      });
    }
    if (!isMstockResponseOk(json)) {
      return res.status(statusCode >= 400 ? statusCode : 400).json({
        ok: false,
        orders: [],
        message: formatMstockApiMessage(json) || 'Order book request failed',
      });
    }
    const data = json?.data ?? json?.Data;
    const orders = Array.isArray(data) ? data : [];
    return res.json({ ok: true, orders });
  } catch (e) {
    return res.status(502).json({
      ok: false,
      orders: [],
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** Retry live option chain (after whitelisting IP on mStock). */
app.post('/api/mstock/retry-option-chain', async (req, res) => {
  clearMstockIpBlock();
  resetOptionChainThrottle();
  if (hasMstockSessionJwt(jwtToken, API_KEY)) startMstockWsFeed();
  const q = Number(req.body?.spot ?? req.query?.spot);
  const spot = Number.isFinite(q) && q > 0 ? q : resolveHeadlineSpot();
  if (spot == null) {
    return res.status(400).json({ ok: false, message: 'No spot available yet' });
  }
  const ok = await refreshMstockOptionChain(spot, true);
  return res.json({
    ok,
    ...chainFieldsForSpot(spot),
  });
});

/** Reload index, 1m bars, and option chain after SMS OTP login. */
app.post('/api/mstock/sync-session', async (_req, res) => {
  if (!jwtToken) {
    return res.status(401).json({
      authenticated: false,
      message: mstockJwtRequiredMessage(process.env, { totpDisabled: mstockTotpDisabled }),
    });
  }
  const sync = await syncMstockSessionData();
  return res.json({
    authenticated: true,
    ...sync,
  });
});

/** Option chain for a given NIFTY spot (live mStock when logged in). */
app.get('/api/option-chain', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = Number(req.query.spot);
  const spot = Number.isFinite(q) && q > 0 ? q : resolveHeadlineSpot();
  if (spot == null) {
    return res.json({
      spot: null,
      atm: null,
      optionChain: [],
      optionChainExpiry: nearestNiftyWeeklyExpiry(),
      chainSource: 'none',
    });
  }
  if (hasMstockSessionJwt(jwtToken, API_KEY)) {
    await refreshMstockOptionChain(spot);
  }
  return res.json(chainFieldsForSpot(spot));
});

/** Daily NIFTY candles — last N trading sessions from mStock Type B only. */
app.get('/api/nifty-history', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const tradingDays = Math.min(10, Math.max(1, Number(_req.query.days) || 5));
  if (!API_KEY) {
    return res.json({
      bars: [],
      tradingDays,
      indexSource: 'mock',
      indexError: 'Set MSTOCK_API_KEY or VITE_MSTOCK_API_KEY in .env',
      polledAt: Date.now(),
    });
  }
  if (!hasMstockSessionJwt(jwtToken, API_KEY)) {
    return res.json({
      bars: [],
      tradingDays,
      indexSource: 'mock',
      indexError: formatMstockAuthHelp('', process.env, { totpDisabled: mstockTotpDisabled }),
      polledAt: Date.now(),
    });
  }
  let result = await fetchNiftyDailyBars(API_KEY, jwtToken, process.env, tradingDays);
  if (!result.bars.length && isMstockAuthError(result.error)) {
    const refreshed = await bootstrapJwt(true);
    if (refreshed) {
      result = await fetchNiftyDailyBars(API_KEY, jwtToken, process.env, tradingDays);
    }
  }
  if (result.error === 'MSTOCK_IP_MISMATCH' || isMstockIpMismatch(result.error)) {
    noteMstockIpBlocked(result.error);
  }
  return res.json({
    bars: result.bars,
    tradingDays,
    indexSource: result.bars.length ? 'mstock' : 'mock',
    indexError: result.bars.length
      ? ''
      : result.error === 'MSTOCK_IP_MISMATCH'
        ? getMstockTypeBBlockMessage()
        : formatMstockApiMessage(result.error) ||
          formatMstockAuthHelp(result.error, process.env, { totpDisabled: mstockTotpDisabled }),
    polledAt: Date.now(),
  });
});

/** Autocomplete NSE stock symbols while typing. */
app.get('/api/equity/symbols/search', async (req, res) => {
  const q = String(req.query?.q ?? req.query?.query ?? '').trim();
  if (!q) return res.json({ suggestions: [] });
  try {
    const suggestions = await searchEquitySymbols(q, API_KEY, jwtToken);
    return res.json({ suggestions });
  } catch (e) {
    return res.status(500).json({
      suggestions: [],
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** Equity watchlist for intraday stock strategy. */
app.get('/api/equity/watchlist', (_req, res) => {
  res.json({ symbols: readWatchlist() });
});

app.post('/api/equity/watchlist', (req, res) => {
  const symbol = String(req.body?.symbol ?? '').trim();
  if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });
  const result = addToWatchlist(symbol);
  if (!result.ok) return res.status(400).json(result);
  return res.json({ ok: true, symbols: result.symbols, added: result.added });
});

app.put('/api/equity/watchlist', (req, res) => {
  const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
  const next = writeWatchlist(symbols);
  return res.json({ ok: true, symbols: next });
});

app.delete('/api/equity/watchlist/:symbol', (req, res) => {
  const result = removeFromWatchlist(req.params.symbol);
  return res.json({ ok: true, symbols: result.symbols });
});

/** Analyze user's stock list — intraday buy purchase price, target, stop-loss only. */
app.get('/api/equity/analyze', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const raw = req.query.symbols;
    const fromQuery = Array.isArray(raw)
      ? raw.flatMap((s) => String(s).split(','))
      : typeof raw === 'string'
        ? raw.split(',')
        : [];
    const symbols = fromQuery.map(normalizeSymbol).filter(Boolean);
    const list = symbols.length ? symbols : readWatchlist();
    const stored = getEquitySuggestSettings();
    const minConfidence = Number(req.query.minConfidence);
    const minTargetPct = Number(req.query.minTargetPct);
    const filters = {
      minConfidence: Number.isFinite(minConfidence) ? minConfidence : stored.minConfidence,
      minTargetPct: Number.isFinite(minTargetPct) ? minTargetPct : stored.minTargetPct,
    };
    const out = await analyzeWatchlist(API_KEY, jwtToken, list, filters);
    void processEquityWatchlist({ apiKey: API_KEY, jwt: jwtToken }, io).catch(() => {});
    void checkEquityPositionExits({ apiKey: API_KEY, jwt: jwtToken }, io).catch(() => {});
    return res.json({ ...out, daySuggestions: readEquitySuggestions() });
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
      stocks: [],
      ranked: [],
      topPick: null,
      analyzedAt: Date.now(),
    });
  }
});

/** Live NIFTY 50 snapshot — refreshes from mStock on every request (browser polls this). */
app.get('/api/nifty-spot', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!API_KEY) {
    return res.json({
      spot: null,
      atm: null,
      optionChain: [],
      optionChainExpiry: nearestNiftyWeeklyExpiry(),
      bars1m: [],
      indexSource: 'mock',
      indexError: 'Set MSTOCK_API_KEY or VITE_MSTOCK_API_KEY in .env',
      indexFromLastCandle: false,
      polledAt: 0,
    });
  }
  try {
    await refreshNiftyIndexFromApi();
    if (areIntradayBarsStale(chartBarsForPayload())) {
      await refreshLiveIntradayBars();
    }
  } catch (e) {
    latestIndexMeta = {
      error: e instanceof Error ? e.message : String(e),
      fromLastCandle: false,
      polledAt: Date.now(),
    };
  }
  const bars1m = chartBarsForPayload();
  const spot = resolveHeadlineSpot();
  if (spot != null) {
    if (hasMstockSessionJwt(jwtToken, API_KEY)) {
      await refreshMstockOptionChain(spot);
    }
    const { atm, optionChain, optionChainExpiry, chainSource } = chainFieldsForSpot(spot);
    const src =
      latestIndexMeta.source === 'public'
        ? 'public'
        : latestIndexMeta.source === 'mstock'
          ? 'mstock'
          : 'pending';
    const strategy = strategyFieldsFromBars(bars1m, spot);
    return res.json({
      spot,
      atm,
      optionChain,
      optionChainExpiry,
      chainSource,
      bars1m,
      rsi: strategy.rsi,
      prior15: strategy.prior15,
      current15: strategy.current15,
      strategyRules: strategy.strategyRules,
      dayChange: dayChangePayload(spot, bars1m),
      indexSource: src,
      indexError: clientIndexError(),
      indexFromLastCandle: latestIndexMeta.fromLastCandle,
      indexLive: src === 'mstock' && !latestIndexMeta.fromLastCandle,
      ipBlocked: isMstockTypeBBlocked(),
      whitelistIp: cachedPublicIp,
      polledAt: latestIndexMeta.polledAt,
    });
  }
  return res.json({
    spot: null,
    atm: null,
    optionChain: [],
    optionChainExpiry: nearestNiftyWeeklyExpiry(),
    bars1m,
    indexSource: !latestIndexMeta.polledAt ? 'pending' : 'mock',
    indexError: !latestIndexMeta.polledAt
      ? 'Fetching…'
      : formatIndexMetaError(latestIndexMeta.error || 'Quote unavailable'),
    indexFromLastCandle: false,
    polledAt: latestIndexMeta.polledAt,
  });
});

const distDir = path.join(__dirname, '..', 'dist');
const serveStatic =
  process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === '1';

if (serveStatic && existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
  console.log(`[NiftyOptima] Serving UI from ${distDir}`);
}

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
  pingInterval: 8000,
  pingTimeout: 20000,
});

function emitPublicFeedStatus() {
  io.emit('feedStatus', {
    connected: true,
    source: 'yahoo-index',
    phase: 'active',
    reason: 'Yahoo ^NSEI polling (mStock IP not whitelisted)',
  });
}

function noteMstockIpBlocked(textOrMessage) {
  if (!markMstockIpBlocked(textOrMessage)) return false;
  logMstockIpBlockOnce();
  stopMstockWsFeed();
  void refreshCachedPublicIp();
  emitPublicFeedStatus();
  return true;
}

/** User-facing index error (avoids duplicating the long whitelist text on public feed). */
function clientIndexError() {
  if (latestIndexMeta.source === 'public' && isMstockTypeBBlocked()) {
    return mstockIpWhitelistUiHint(cachedPublicIp);
  }
  return formatIndexMetaError(latestIndexMeta.error || '');
}

const feed = new MockNiftyFeed({ tickMs: Number(process.env.FEED_TICK_MS || 700) });
const liveIntradayBars = new LiveIntradayBars();
let liveBarsRefreshInFlight = false;

/** Live NIFTY 50 from Type B (poll); merged into every tick. `source` is set when LTP is valid. */
let latestIndexLtp = null;
let latestIndexMeta = {
  error: '',
  fromLastCandle: false,
  polledAt: 0,
  /** @type {'mstock' | 'public' | null} */
  source: null,
  previousClose: null,
};

function dayChangePayload(spot, bars1m) {
  const prev =
    latestIndexMeta.previousClose != null && Number.isFinite(latestIndexMeta.previousClose)
      ? latestIndexMeta.previousClose
      : null;
  return computeNiftyDayChange(spot, bars1m, prev);
}

/** Yahoo ^NSEI when enabled in .env or when mStock Type B is IP-blocked (IA403). */
function publicSpotFallbackEnabled() {
  const v = process.env.NIFTY_PUBLIC_SPOT_FALLBACK;
  return v === '1' || v === 'true' || v === 'on';
}

function shouldUsePublicSpotFallback() {
  return publicSpotFallbackEnabled() || isMstockTypeBBlocked();
}

function formatIndexMetaError(raw) {
  if (!raw || typeof raw !== 'string') return '';
  if (raw === MSTOCK_IP_MISMATCH || isMstockIpMismatch(raw)) {
    return getMstockTypeBBlockMessage();
  }
  const trimmed = raw.startsWith('Quote: ') ? raw.slice(7).trim() : raw.trim();
  if (trimmed.startsWith('{')) {
    return formatMstockApiMessage(trimmed) || getMstockTypeBBlockMessage();
  }
  return formatMstockApiMessage(trimmed) || trimmed;
}

/** Apply Yahoo ^NSEI headline + 1m bars when mStock quote is unavailable. */
async function applyPublicHeadlineFallback(mstockErr = '') {
  const pub = await fetchPublicNiftyIntraday();
  if (pub.ltp != null && Number.isFinite(pub.ltp)) {
    latestIndexLtp = pub.ltp;
    liveIntradayBars.updateLtp(pub.ltp);
    if (pub.bars.length) {
      liveIntradayBars.setBars(pub.bars);
    }
    latestIndexMeta = {
      error: formatPublicIndexNote(jwtToken, mstockErr, pub.note),
      fromLastCandle: false,
      polledAt: Date.now(),
      source: 'public',
      previousClose: pub.previousClose ?? null,
    };
    if (isMstockTypeBBlocked()) emitPublicFeedStatus();
    return true;
  }
  return false;
}

function useMstockForMarketData() {
  return Boolean(API_KEY);
}

async function seedPublicIntradayBars() {
  const pub = await fetchPublicNiftyIntraday();
  if (!pub.bars.length && pub.ltp == null) return pub;
  if (pub.bars.length) {
    liveIntradayBars.setBars(pub.bars);
    console.log(`[NiftyOptima] Loaded ${pub.bars.length} public 1m bars (Yahoo ^NSEI, aligned with headline)`);
  }
  if (pub.ltp != null) {
    latestIndexLtp = pub.ltp;
    liveIntradayBars.updateLtp(pub.ltp);
    if (latestIndexMeta.source !== 'public') {
      latestIndexMeta = {
        ...latestIndexMeta,
        source: 'public',
        fromLastCandle: false,
        polledAt: Date.now(),
        previousClose: pub.previousClose ?? latestIndexMeta.previousClose,
      };
    }
  }
  return pub;
}

async function refreshLiveIntradayBars() {
  if (!API_KEY || liveBarsRefreshInFlight) return 0;
  liveBarsRefreshInFlight = true;
  try {
    if (!hasMstockSessionJwt(jwtToken, API_KEY)) {
      if (shouldUsePublicSpotFallback()) await seedPublicIntradayBars();
      return liveIntradayBars.length;
    }
    let { bars, error } = await fetchNifty1mBars(API_KEY, jwtToken, process.env);
    if (!bars.length && isMstockAuthError(error)) {
      const refreshed = await bootstrapJwt(true);
      if (refreshed) {
        ({ bars, error } = await fetchNifty1mBars(API_KEY, jwtToken, process.env));
      }
    }
    if (bars.length) {
      liveIntradayBars.setBars(bars);
      if (latestIndexLtp != null) liveIntradayBars.updateLtp(latestIndexLtp);
      console.log(`[NiftyOptima] Loaded ${bars.length} mStock 1m bars (EMA/VWAP + strategy)`);
      if (areIntradayBarsStale(bars)) {
        console.warn('[NiftyOptima] mStock 1m bars look delayed — refresh JWT or check market hours');
      }
      return bars.length;
    }
    if (error) {
      if (error === 'MSTOCK_IP_MISMATCH' || isMstockIpMismatch(error)) {
        noteMstockIpBlocked(error);
      } else {
        const msg = jwtToken
          ? `mStock 1m bars failed (session may have expired): ${error}`
          : formatMstockAuthHelp(error, process.env, { totpDisabled: mstockTotpDisabled });
        console.warn('[NiftyOptima]', msg);
      }
    }
    if (shouldUsePublicSpotFallback()) {
      await seedPublicIntradayBars();
    }
    return liveIntradayBars.length;
  } catch (e) {
    console.warn('[NiftyOptima] 1m bars fetch failed:', e instanceof Error ? e.message : e);
    if (shouldUsePublicSpotFallback()) await seedPublicIntradayBars();
    return liveIntradayBars.length;
  } finally {
    liveBarsRefreshInFlight = false;
  }
}

function applyWsNiftyLtp(ltp) {
  if (!Number.isFinite(ltp)) return;
  latestIndexLtp = ltp;
  lastWsLtpAt = Date.now();
  liveIntradayBars.updateLtp(ltp);
  latestIndexMeta = {
    error: '',
    fromLastCandle: false,
    polledAt: Date.now(),
    source: 'mstock',
  };
}

function startMstockWsFeed() {
  const wsUrl = getMstockWsUrl();
  if (!wsUrl || mstockWsClient) return;
  if (isMstockTypeBBlocked()) return;
  if (!hasMstockSessionJwt(jwtToken, API_KEY)) return;
  console.log('[NiftyOptima] mStock broadcast WebSocket:', wsUrl.split('?')[0]);
  mstockWsClient = startMstockBroadcastWs(wsUrl, {
    onLtp: applyWsNiftyLtp,
    onStatus: (s) => io.emit('feedStatus', s),
  });
}

async function refreshNiftyIndexFromApi() {
  if (!API_KEY) return;
  if (wsLtpIsFresh(15_000)) return;
  let mstockErr = '';
  /** @type {number | null} */
  let staleMstockLtp = null;

  if (jwtToken) {
    try {
      const r = await fetchNiftyIndexLtp(API_KEY, jwtToken);
      if (r.ltp != null && Number.isFinite(r.ltp) && !r.fromLastCandle) {
        latestIndexLtp = r.ltp;
        liveIntradayBars.updateLtp(r.ltp);
        latestIndexMeta = {
          error: r.error || '',
          fromLastCandle: false,
          polledAt: Date.now(),
          source: 'mstock',
        };
        return;
      }
      if (r.ltp != null && Number.isFinite(r.ltp) && r.fromLastCandle) {
        staleMstockLtp = r.ltp;
      }
      mstockErr =
        r.error ||
        (r.fromLastCandle ? 'mStock live quote unavailable — using last mStock historical close' : '');
      if (r.error === MSTOCK_IP_MISMATCH || isMstockIpMismatch(r.error)) {
        noteMstockIpBlocked(r.error);
      }
    } catch (e) {
      mstockErr = e instanceof Error ? e.message : String(e);
    }
  }

  if (staleMstockLtp != null) {
    latestIndexLtp = staleMstockLtp;
    liveIntradayBars.updateLtp(staleMstockLtp);
    latestIndexMeta = {
      error: mstockErr || 'Using last mStock historical close',
      fromLastCandle: true,
      polledAt: Date.now(),
      source: 'mstock',
    };
    return;
  }

  if (shouldUsePublicSpotFallback()) {
    if (await applyPublicHeadlineFallback(mstockErr)) {
      if (isMstockTypeBBlocked()) stopMstockWsFeed();
      return;
    }
    latestIndexLtp = null;
    latestIndexMeta = {
      error: formatIndexMetaError(mstockErr) || 'Quote unavailable',
      fromLastCandle: false,
      polledAt: Date.now(),
      source: null,
    };
    return;
  }

  latestIndexLtp = null;
  latestIndexMeta = {
    error: formatIndexMetaError(
      mstockErr ||
        (jwtToken
          ? 'mStock quote failed. Check API key IP whitelist and session (OTP login).'
          : 'Log in with mStock SMS OTP on this app (or npm run mstock:token).')
    ),
    fromLastCandle: false,
    polledAt: Date.now(),
    source: null,
  };
}

function chartBarsForPayload() {
  if (liveIntradayBars.length < 1) return [];
  if (latestIndexLtp != null) liveIntradayBars.updateLtp(latestIndexLtp);
  return liveIntradayBars.getBars(180);
}

/** RSI + 15m breakout legs for strategy card (REST + ticks). */
function strategyFieldsFromBars(bars1m, spot, fallbackRules = null) {
  if (!bars1m?.length || spot == null || !Number.isFinite(spot)) {
    return {
      rsi: null,
      prior15: null,
      current15: null,
      strategyRules: fallbackRules ?? { ce: null, pe: null },
      side: null,
      prevClose: null,
    };
  }
  const ctx = evaluateBreakoutContext(bars1m, spot);
  return {
    rsi: ctx.rsi,
    prior15: ctx.prior15,
    current15: ctx.current15,
    strategyRules: mergeStrategyRules(ctx.rules, fallbackRules),
    side: ctx.side,
    prevClose: ctx.prevClose,
  };
}

/** Headline spot: live quote/WS LTP first; 1m close only when no live index. */
function resolveHeadlineSpot() {
  if (latestIndexLtp != null && Number.isFinite(latestIndexLtp)) {
    return latestIndexLtp;
  }
  const bars = chartBarsForPayload();
  if (bars.length > 0) {
    const close = bars[bars.length - 1].close;
    if (Number.isFinite(close)) return close;
  }
  return null;
}

function wsLtpIsFresh(maxAgeMs = 15_000) {
  return Boolean(lastWsLtpAt && Date.now() - lastWsLtpAt < maxAgeMs);
}

function buildChainUserNote() {
  if (!hasMstockSessionJwt(jwtToken, API_KEY)) {
    return 'Log in with SMS OTP (mStock login screen) for live broker CE/PE prices.';
  }
  if (isMstockTypeBBlocked()) return getMstockTypeBBlockMessage();
  return '';
}

async function refreshMstockOptionChain(spot, force = false) {
  if (!API_KEY || !hasMstockSessionJwt(jwtToken, API_KEY) || spot == null) return false;
  if (!force && !shouldAttemptOptionChainFetch()) return false;
  try {
    const live = await fetchMstockNiftyOptionChain(API_KEY, jwtToken, spot);
    if (!live.chain?.length) return false;
    mstockChainCache = {
      spot,
      atm: live.atm,
      chain: live.chain,
      expiry: live.expiryIso,
      fetchedAt: Date.now(),
      source: 'mstock',
    };
    console.log(`[NiftyOptima] mStock option chain: ${live.chain.length} strikes (broker LTP)`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const raw = e instanceof Error ? e.message + (e.hint || '') : msg;
    if (e?.code === MSTOCK_IP_MISMATCH || isMstockIpMismatch(raw)) {
      noteMstockIpBlocked(raw);
      return false;
    }
    logMstockOptionChainWarn(msg);
    return false;
  }
}

function chainFieldsForSpot(spot) {
  if (spot == null || !Number.isFinite(spot)) {
    return {
      spot: null,
      atm: null,
      optionChain: [],
      optionChainExpiry: nearestNiftyWeeklyExpiry(),
      chainSource: 'none',
    };
  }
  const atm = atmStrike(spot, 50);
  const c = mstockChainCache;
  const cacheAge = Date.now() - (c.fetchedAt || 0);
  const cacheHasAtm = c.chain.some((r) => Number(r.strike) === atm);
  if (
    c.source === 'mstock' &&
    c.chain.length &&
    cacheHasAtm &&
    Math.abs(c.spot - spot) < 80 &&
    cacheAge < 300_000
  ) {
    return {
      spot,
      atm: c.atm,
      optionChain: c.chain,
      optionChainExpiry: c.expiry,
      chainSource: 'mstock',
    };
  }
  const { chain, expiry } = getOptionChainForSpot(spot, atm);
  const note = buildChainUserNote();
  return {
    spot,
    atm,
    optionChain: chain,
    optionChainExpiry: expiry,
    chainSource: 'sim',
    chainIpBlocked: isMstockTypeBBlocked(),
    chainNote: note || undefined,
    needsLogin: !hasMstockSessionJwt(jwtToken, API_KEY),
  };
}

/** After OTP: refresh quote, bars, and live option chain. */
async function syncMstockSessionData() {
  await refreshNiftyIndexFromApi();
  const spot = resolveHeadlineSpot();
  let optionChainLive = false;
  if (spot != null) {
    resetOptionChainThrottle();
    optionChainLive = await refreshMstockOptionChain(spot, true);
  }
  const barsCount = await refreshLiveIntradayBars();
  return { spot, barsCount, optionChainLive, chainSource: mstockChainCache.source };
}

let lastEmittedDailySignalKey = '';
/** Multiple best buys per IST day — one per 15m breakout window; suppressed while position open. */
let dailyBuyState = {
  dayKey: '',
  emittedKeys: [],
  signalsToday: 0,
  lastSignal: null,
  ceScore: 0,
  peScore: 0,
};

/** Chart bars + strategy context: live broker history when available, else mock/feed bars. */
function resolveBarsForMerge(payload) {
  const feedBars = Array.isArray(payload.bars1m) ? payload.bars1m : [];
  if (liveIntradayBars.length < 1) {
    return { bars1m: feedBars, barsForCtx: feedBars };
  }
  const liveBars = chartBarsForPayload();
  const mstockSession = hasMstockSessionJwt(jwtToken, API_KEY);
  const barsForCtx = pickBarsForStrategy(liveBars, feedBars);
  const bars1m =
    useMstockForMarketData() && mstockSession
      ? liveBars.length > 0
        ? liveBars
        : feedBars
      : liveBars.length > 0
        ? liveBars
        : feedBars;
  return { bars1m, barsForCtx };
}

/** Score setup, update day state, emit socket signal + optional auto-buy. */
function runDailyBuyPipeline(spot, strategy, chainRows) {
  const dayKey = istDayKey();
  const openPositions = openNiftyPositionsFromLogs(dayKey);
  const hasOpenPosition = openPositions.length > 0;
  const openPosition = hasOpenPosition ? openPositions[0] : null;

  const { minDailyScore } = getNiftyTradingSettings();
  const daily = resolveDailyBestBuy({
    state: dailyBuyState,
    now: Date.now(),
    spot,
    ctx: {
      rsi: strategy.rsi,
      prior15: strategy.prior15,
      prevClose: strategy.prevClose,
      rules: strategy.strategyRules,
      side: strategy.side,
    },
    chainRows,
    hasOpenPosition,
    openPosition,
    minScore: minDailyScore,
  });

  if (daily.dayKey !== dailyBuyState.dayKey) {
    dailyBuyState = {
      dayKey: daily.dayKey,
      emittedKeys: [],
      signalsToday: 0,
      lastSignal: null,
      ceScore: 0,
      peScore: 0,
    };
  }

  if (daily.isNewSignal && daily.signal) {
    dailyBuyState = {
      dayKey: daily.dayKey,
      emittedKeys: daily.emittedKeys,
      signalsToday: daily.signalsToday,
      lastSignal: daily.lastSignal,
      ceScore: daily.ceScore,
      peScore: daily.peScore,
    };
  } else {
    dailyBuyState = {
      ...dailyBuyState,
      dayKey: daily.dayKey,
      ceScore: daily.ceScore,
      peScore: daily.peScore,
    };
  }

  const activeSignal = daily.suppressedByPosition ? null : daily.signal;
  if (daily.isNewSignal && activeSignal) {
    const windowKey = signalWindowKey(
      daily.dayKey,
      activeSignal.optionType,
      strategy.prior15
    );
    appendNiftySuggestion(
      { ...activeSignal, dayKey: daily.dayKey },
      { dedupeKey: windowKey, status: 'active' }
    );
    const emitKey = `${daily.dayKey}-${activeSignal.side}-${activeSignal.strike}-${activeSignal.ts}`;
    if (emitKey !== lastEmittedDailySignalKey) {
      lastEmittedDailySignalKey = emitKey;
      io.emit('signal', activeSignal);
      void autoBuyOnSignal(activeSignal, { apiKey: API_KEY, jwt: jwtToken }).then((r) => {
        if (!r.skipped && r.log) io.emit('orderLog', r.log);
        if (!r.skipped && r.targetSellLog) io.emit('orderLog', r.targetSellLog);
        if (!r.skipped && r.stopLossSellLog) io.emit('orderLog', r.stopLossSellLog);
      });
    }
  }

  if (daily.candidateSignal && daily.suppressedByPosition && daily.holdSuggestion) {
    const windowKey = signalWindowKey(
      daily.dayKey,
      daily.candidateSignal.optionType,
      strategy.prior15
    );
    appendNiftySuggestion(
      { ...daily.candidateSignal, dayKey: daily.dayKey },
      { dedupeKey: windowKey, status: 'suppressed' }
    );
  }

  if (chainRows.length) {
    void checkPositionExits(chainRows, { apiKey: API_KEY, jwt: jwtToken }).then((r) => {
      for (const ex of r.exits || []) {
        if (ex.log) io.emit('orderLog', ex.log);
      }
    });
  }

  const todaySuggestions = readNiftySuggestions(daily.dayKey);

  return {
    activeSignal,
    dailyBestBuy: {
      confidence: activeSignal?.confidence ?? null,
      ceScore: daily.ceScore,
      peScore: daily.peScore,
      dayKey: daily.dayKey,
      signalsToday: daily.signalsToday,
      signal: activeSignal,
      suppressedByPosition: daily.suppressedByPosition,
      holdSuggestion: daily.holdSuggestion,
      candidateSignal: daily.candidateSignal ?? null,
      hasOpenPosition,
      todaySuggestions,
    },
  };
}

function mergeLiveBars(payload) {
  const { bars1m, barsForCtx } = resolveBarsForMerge(payload);
  const spot = resolveHeadlineSpot() ?? payload.spot;
  const strategy = strategyFieldsFromBars(barsForCtx, spot, payload.strategyRules);
  const rsi = strategy.rsi;
  const sentiment = rsi == null ? payload.sentiment : Math.min(100, Math.max(0, rsi));
  const chainFields = spot != null ? chainFieldsForSpot(spot) : null;
  let chainForSignal = chainFields?.optionChain ?? [];
  if (chainForSignal.length && spot != null) {
    chainForSignal = normalizeOptionChainRows(
      chainForSignal,
      spot,
      chainFields.optionChainExpiry ?? nearestNiftyWeeklyExpiry()
    );
  }
  const { dailyBestBuy } = runDailyBuyPipeline(spot, strategy, chainForSignal);

  return {
    ...payload,
    spot: spot ?? payload.spot,
    bars1m,
    rsi: rsi == null ? payload.rsi : rsi,
    prior15: strategy.prior15 ?? payload.prior15,
    current15: strategy.current15 ?? payload.current15,
    sentiment,
    strategyRules: strategy.strategyRules,
    dailyBestBuy,
    dayChange: dayChangePayload(spot ?? payload.spot, bars1m),
  };
}

function mergeLiveIndex(payload) {
  const withBars = mergeLiveBars(payload);
  const spot = resolveHeadlineSpot();
  const chainFields = spot != null ? chainFieldsForSpot(spot) : null;

  if (!API_KEY) {
    return {
      ...withBars,
      ...(chainFields ?? {}),
      indexSource: 'mock',
      indexError: '',
      indexPollAt: 0,
      indexFromLastCandle: false,
    };
  }

  if (chainFields) {
    const src =
      latestIndexMeta.source === 'public'
        ? 'public'
        : latestIndexMeta.source === 'mstock'
          ? 'mstock'
          : 'pending';
    return {
      ...withBars,
      ...chainFields,
      indexSource: src,
      indexError: src === 'public' ? clientIndexError() : '',
      ipBlocked: isMstockTypeBBlocked(),
      whitelistIp: cachedPublicIp,
      indexPollAt: latestIndexMeta.polledAt,
      indexFromLastCandle: latestIndexMeta.fromLastCandle,
    };
  }

  const src =
    latestIndexMeta.source === 'public'
      ? 'public'
      : latestIndexMeta.source === 'mstock'
        ? 'mstock'
        : !latestIndexMeta.polledAt
          ? 'pending'
          : 'mock';

  return {
    ...withBars,
    ...(chainFields ?? {}),
    indexSource: src,
    indexError: clientIndexError(),
    ipBlocked: isMstockTypeBBlocked(),
    whitelistIp: cachedPublicIp,
    indexPollAt: latestIndexMeta.polledAt,
    indexFromLastCandle: latestIndexMeta.fromLastCandle,
  };
}

io.on('connection', (socket) => {
  socket.emit('hello', { ok: true, transport: 'socket.io', latencyBudgetMs: 500 });
  if (isMstockTypeBBlocked() && latestIndexMeta.source === 'public') {
    socket.emit('feedStatus', {
      connected: true,
      source: 'yahoo-index',
      phase: 'active',
      reason: 'Yahoo ^NSEI polling (mStock IP not whitelisted)',
    });
  }
});

feed.on('tick', (p) => {
  io.emit('tick', mergeLiveIndex(p));
});
feed.on('signal', () => {
  // Buy signals only from mergeLiveBars (one daily best-buy per IST day).
});
feed.on('status', (s) => io.emit('feedStatus', s));

/** Auto-reconnect pattern: restart mock feed on interval to simulate broker drop recovery. */
let reconnectTimer = null;
function startFeedWithReconnect() {
  feed.start();
  if (reconnectTimer) clearInterval(reconnectTimer);
  if (process.env.SIMULATE_FEED_DROP_MS) {
    const ms = Number(process.env.SIMULATE_FEED_DROP_MS);
    reconnectTimer = setInterval(() => {
      io.emit('feedStatus', { connected: false, reason: 'simulated-drop' });
      feed.stop();
      setTimeout(() => {
        feed.start();
        io.emit('feedStatus', { connected: true, reason: 'reconnected' });
      }, 1200);
    }, ms);
  }
}

function listenOnce(p) {
  return new Promise((resolve, reject) => {
    function onError(err) {
      httpServer.off('error', onError);
      reject(err);
    }
    httpServer.once('error', onError);
    httpServer.listen(p, '0.0.0.0', () => {
      httpServer.off('error', onError);
      resolve(p);
    });
  });
}

/** Log LAN URLs so mobile NIFTYOPTIMA_API can be set (e.g. http://192.168.1.6:3200). */
async function logLanUrls(port) {
  try {
    const os = await import('node:os');
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
      }
    }
    if (ips.length) {
      for (const ip of ips) {
        console.log(`[NiftyOptima] Mobile .env → NIFTYOPTIMA_API=http://${ip}:${port}`);
      }
    }
  } catch {
    /* ignore */
  }
}

async function listenWithFallback(startPort) {
  for (let i = 0; i < PORT_FALLBACK_MAX; i++) {
    const p = startPort + i;
    try {
      await listenOnce(p);
      return p;
    } catch (e) {
      if (e.code === 'EADDRINUSE') continue;
      throw e;
    }
  }
  const last = startPort + PORT_FALLBACK_MAX - 1;
  throw new Error(
    `[NiftyOptima] No free port in range ${startPort}–${last}. Set NIFTYOPTIMA_PORT or stop other listeners.`,
  );
}

async function startHttp() {
  let port;
  if (CLOUD_PORT) {
    await listenOnce(CLOUD_PORT);
    port = CLOUD_PORT;
  } else if (STRICT_PORT) {
    try {
      await listenOnce(DESIRED_PORT);
      port = DESIRED_PORT;
    } catch (e) {
      if (e.code === 'EADDRINUSE') {
        console.error(
          `[NiftyOptima] Port ${DESIRED_PORT} is already in use (NIFTYOPTIMA_STRICT_PORT=1). ` +
            `On Windows: netstat -ano | findstr :${DESIRED_PORT} then taskkill /PID <pid> /F`,
        );
        process.exit(1);
      }
      throw e;
    }
  } else {
    port = await listenWithFallback(DESIRED_PORT);
    if (port !== DESIRED_PORT) {
      console.warn(`[NiftyOptima] Port ${DESIRED_PORT} was busy — using ${port}`);
    }
  }

  console.log(`[NiftyOptima] LISTEN_PORT=${port}`);
  console.log(`[NiftyOptima] API + WebSocket http://localhost:${port}`);
  void logLanUrls(port);
  void (async () => {
    try {
    if (!API_KEY) {
      console.warn('[NiftyOptima] MSTOCK_API_KEY / VITE_MSTOCK_API_KEY not set — index uses mock until .env is configured');
    } else {
      const suffix = API_KEY.length >= 4 ? API_KEY.slice(-4) : '????';
      console.log(`[NiftyOptima] API key loaded (…${suffix}) — fetching live NIFTY 50 index (Type B)`);
      await bootstrapJwt();
      scheduleTotpJwtRefresh();
      await refreshNiftyIndexFromApi();
      await refreshLiveIntradayBars();
      if (!isMstockTypeBBlocked()) startMstockWsFeed();
      else emitPublicFeedStatus();
      const barsMs = Number(process.env.NIFTY_BARS_REFRESH_MS || 60_000);
      setInterval(() => {
        void refreshLiveIntradayBars();
        const s = resolveHeadlineSpot();
        if (s != null && hasMstockSessionJwt(jwtToken, API_KEY)) {
          void refreshMstockOptionChain(s);
        }
      }, barsMs);
      if (latestIndexMeta.source === 'public') {
        console.warn(
          jwtToken
            ? '[NiftyOptima] Headline NIFTY from public feed — mStock quote failed; refresh JWT (npm run mstock:totp)'
            : '[NiftyOptima] Headline NIFTY from public feed. Set MSTOCK_TOTP_SECRET or run npm run mstock:totp',
        );
      } else if (!jwtToken) {
        console.warn(
          mstockTotpDisabled
            ? '[NiftyOptima] No JWT — enter SMS OTP on the app login screen (or npm run mstock:token). Chart uses public bars until then.'
            : '[NiftyOptima] No JWT — enter OTP on first page load or run npm run mstock:token. Chart uses public bars until then.',
        );
      }
      const pollMs = Number(process.env.NIFTY_INDEX_POLL_MS || 4000);
      setInterval(() => {
        void refreshNiftyIndexFromApi().catch((e) => {
          console.warn('[NiftyOptima] index poll:', e instanceof Error ? e.message : e);
        });
      }, pollMs);
    }
    startFeedWithReconnect();
    const equityMs = Number(process.env.EQUITY_SCAN_MS || 30_000);
    setInterval(() => {
      void processEquityWatchlist({ apiKey: API_KEY, jwt: jwtToken }, io).catch(() => {});
    }, equityMs);
    } catch (e) {
      console.error('[NiftyOptima] Startup failed:', e instanceof Error ? e.stack || e.message : e);
      try {
        await applyPublicHeadlineFallback();
        startFeedWithReconnect();
      } catch (e2) {
        console.error('[NiftyOptima] Public fallback failed:', e2 instanceof Error ? e2.message : e2);
        startFeedWithReconnect();
      }
    }
  })();
}

void startHttp().catch((err) => {
  console.error(err);
  process.exit(1);
});
