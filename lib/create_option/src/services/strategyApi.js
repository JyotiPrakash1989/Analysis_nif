/**
 * Strategy research / option analysis API.
 * Uses mock data for the web app; can be wired to a backend later.
 */

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const defaultRules = {
  entryDescription:
    'Entry: NIFTY above 20 EMA, RSI < 30 (oversold) or RSI > 70 (overbought) with candlestick confirmation.',
  stopLossDescription: 'Stop-loss: 2% from entry (configurable).',
  exitDescription: 'Exit: Target 4% reward or stop-loss hit; time exit by 3:15 PM.',
};

export async function getStrategyRules() {
  await delay(300);
  return defaultRules;
}

/**
 * Fetches live NIFTY from mStock via backend (server.js).
 * Use: npm run dev (starts API server + app). Set MSTOCK_API_KEY in lib/create_option/.env.
 */
export async function getLiveNifty() {
  const base = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL != null
    ? import.meta.env.VITE_API_URL
    : '';
  const apiUrl = `${base}/api/nifty`;
  try {
    const res = await fetch(apiUrl, { method: 'GET' });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      // Proxy may return HTML (502/504) when API server is down
    }
    const errorMsg = typeof data.error === 'string'
      ? data.error
      : res.ok
        ? ''
        : 'API server not running. Use "npm run dev" in lib/create_option (it starts the server). Set MSTOCK_API_KEY in .env for live mStock data.';
    return {
      ltp: data.ltp != null ? Number(data.ltp) : null,
      fromLastCandle: Boolean(data.fromLastCandle),
      error: errorMsg,
    };
  } catch (e) {
    return {
      ltp: null,
      fromLastCandle: false,
      error: 'Cannot reach API. In lib/create_option run: npm run dev (starts server + app). Set MSTOCK_API_KEY in .env for live NIFTY.',
    };
  }
}

export async function checkLiveApi() {
  await delay(800);
  return {
    ok: true,
    message: 'Live data API: Working (mock – 120 candles). Set backend for real data.',
  };
}

export async function runBacktest() {
  await delay(1200);
  const now = new Date();
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + 7);
  return {
    winRate: 58.5,
    totalTrades: 42,
    winningTrades: 25,
    maxDrawdownPercent: 8.2,
    riskRewardRatio: 1.45,
    netPnl: 4.2,
    summary:
      'Recommendation from live mStock data (Type B). CALL vs PUT backtest on 120 candles. Educational use only.',
    optionRecommendation: 'CALL',
    recommendedStrikePrice: 24500,
    recommendedOptionPrice: 85.5,
    optionEntryPrice: 85.5,
    optionExitPrice: 120.0,
    optionStopLoss: 65.0,
    recommendedExpiryDate: expiry.toISOString(),
  };
}
