/**
 * Auto equity intraday: voice signal + BUY 1 qty when purchase setup fires.
 */

import { stockMeetsSuggestFilters } from './equityAnalysis.mjs';
import { getEquitySuggestSettings } from './equitySuggestSettings.mjs';
import { analyzeWatchlist } from './equityQuotes.mjs';
import { readWatchlist } from './equityWatchlist.mjs';
import { appendOrderLog, istDayKey, readDayLogs } from './orderLog.mjs';
import { appendEquitySuggestion, hasEquitySuggestionForSymbol } from './suggestionLog.mjs';
import { placeEquityBuyWithExits } from './equityPlaceOrder.mjs';
import { buildEquityExitLogRows } from './equityOrderLog.mjs';
import { checkEquityPositionExits } from './equityPositionMonitor.mjs';

/** Default on — set EQUITY_AUTO_TRADING_DEFAULT=0 to disable auto buy. */
let equityAutoEnabled = process.env.EQUITY_AUTO_TRADING_DEFAULT !== '0';

/** `${dayKey}-${symbol}` keys already auto-bought or signaled this session. */
const processedKeys = new Set();
/** Last emitted signal key per symbol for socket dedupe. */
const lastSignalKeys = new Map();

export function isEquityAutoTradingEnabled() {
  return equityAutoEnabled;
}

export function setEquityAutoTradingEnabled(value) {
  equityAutoEnabled = Boolean(value);
  return equityAutoEnabled;
}

function openEquitySymbols(dayKey = istDayKey()) {
  const logs = readDayLogs(dayKey);
  const closed = new Set(
    logs
      .filter((r) => r.assetType === 'equity' && r.action === 'SELL' && r.parentBuyId)
      .filter((r) => ['target_exit', 'stoploss_exit', 'closed'].includes(r.status))
      .map((r) => String(r.parentBuyId))
  );
  const open = new Set();
  for (const r of logs) {
    if (r.assetType !== 'equity' || r.action !== 'BUY') continue;
    if (!['open', 'submitted', 'simulated'].includes(r.status)) continue;
    if (!r.orderId || closed.has(String(r.orderId))) continue;
    if (r.equitySymbol) open.add(String(r.equitySymbol).toUpperCase());
  }
  return open;
}

function signalKey(dayKey, symbol, analysis) {
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  return `${dayKey}-${symbol}-${analysis.confidence}-${bucket}`;
}

/**
 * Scan watchlist, emit purchase signals, auto-buy 1 qty when enabled.
 * @param {{ apiKey?: string, jwt?: string }} session
 * @param {{ emit?: (event: string, payload: unknown) => void }} [io]
 */
export async function processEquityWatchlist(session, io = null) {
  const symbols = readWatchlist();
  if (!symbols.length) {
    return { scanned: 0, signals: [], orders: [] };
  }

  const suggestFilters = getEquitySuggestSettings();
  const result = await analyzeWatchlist(session.apiKey, session.jwt, symbols, suggestFilters);
  const scanned = symbols.length;
  const dayKey = istDayKey();
  const openSymbols = openEquitySymbols(dayKey);
  const signals = [];
  const orders = [];

  // Only signal and auto-buy ranked top picks — fewer, higher-confluence setups.
  for (const stock of result.ranked) {
    const a = stock.analysis;
    if (!stockMeetsSuggestFilters(stock, suggestFilters)) continue;

    const sym = stock.symbol;
    const buyKey = `${dayKey}-${sym}`;
    const sigKey = signalKey(dayKey, sym, a);

    if (lastSignalKeys.get(sym) !== sigKey) {
      lastSignalKeys.set(sym, sigKey);
      const payload = {
        symbol: sym,
        entry: a.entry,
        sl: a.sl,
        tgt: a.tgt,
        confidence: a.confidence,
        ltp: stock.ltp,
        rationale: a.rationale,
        ts: Date.now(),
        autoTrading: equityAutoEnabled,
      };
      signals.push(payload);
      // Log once per symbol per day; repeat scans only emit socket for voice.
      if (!hasEquitySuggestionForSymbol(sym, dayKey)) {
        appendEquitySuggestion({ ...payload, dayKey, dedupeKey: `${dayKey}-${sym}` });
      }
      io?.emit?.('equitySignal', payload);
    }

    if (!equityAutoEnabled) continue;
    if (processedKeys.has(buyKey)) continue;
    if (openSymbols.has(sym)) continue;
    // Auto-buy only the single best-ranked pick per scan.
    if (result.topPick?.symbol !== sym) continue;

    processedKeys.add(buyKey);

    const out = await placeEquityBuyWithExits(
      {
        symbol: sym,
        quantity: 1,
        entry: a.entry,
        sl: a.sl,
        tgt: a.tgt,
      },
      session
    );

    const buy = out.buy ?? out;
    const logRow = appendOrderLog({
      dayKey,
      ts: Date.now(),
      assetType: 'equity',
      equitySymbol: sym,
      action: 'BUY',
      mode: 'auto',
      trigger: 'equity_signal',
      optionType: 'EQ',
      strike: 0,
      lots: 1,
      units: 1,
      lotsize: 1,
      entry: a.entry,
      sl: a.sl,
      tgt: a.tgt,
      ltp: stock.ltp,
      orderId: buy.orderId,
      mock: buy.mock,
      status: buy.ok ? (buy.mock ? 'simulated' : 'open') : 'failed',
      message: buy.message || (buy.ok ? 'Auto equity buy on purchase signal' : 'Auto equity buy failed'),
      tradingsymbol: buy.tradingsymbol,
      exchange: buy.exchange,
    });

    io?.emit?.('equityOrderLog', logRow);
    io?.emit?.('orderLog', logRow);
    orders.push({ symbol: sym, buy, log: logRow });

    if (buy.ok) {
      const exitLogs = buildEquityExitLogRows({
        dayKey,
        symbol: sym,
        buy,
        out,
        mode: 'auto',
        entry: a.entry,
        sl: a.sl,
        tgt: a.tgt,
      });
      for (const row of exitLogs) {
        const saved = appendOrderLog(row);
        io?.emit?.('equityOrderLog', saved);
        io?.emit?.('orderLog', saved);
      }
    }
  }

  void checkEquityPositionExits(session, io).catch(() => {});

  return { scanned, signals, orders, analyzedAt: result.analyzedAt };
}

export function resetEquityAutoKeys(dayKey = istDayKey()) {
  for (const key of [...processedKeys]) {
    if (!key.startsWith(dayKey)) processedKeys.delete(key);
  }
}
