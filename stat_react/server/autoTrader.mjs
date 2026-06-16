/**
 * Auto trading: buy on daily signal, sell when target or stop-loss premium is hit.
 * Manual mode skips auto placement (user uses Execute on UI).
 */

import {
  appendOrderLog,
  hasPendingTargetSell,
  istDayKey,
  openPositionsFromLogs,
  readDayLogs,
} from './orderLog.mjs';
import { placeBuyWithExits, placeOrder } from './placeOrder.mjs';

let autoTradingEnabled =
  process.env.AUTO_TRADING_DEFAULT === '1' || process.env.AUTO_TRADING_DEFAULT === 'true';

/** Prevent duplicate auto-buys for the same daily signal. */
let lastAutoBuyKey = '';
/** Prevent duplicate exits per position (target or stop-loss). */
const exitInFlight = new Set();
/** Failed exit orders — do not retry on every tick. */
const exitGaveUp = new Set();

export function isAutoTradingEnabled() {
  return autoTradingEnabled;
}

export function setAutoTradingEnabled(value) {
  autoTradingEnabled = Boolean(value);
  return autoTradingEnabled;
}

/**
 * @param {object} signal
 * @param {{ apiKey?: string, jwt?: string }} session
 */
export async function autoBuyOnSignal(signal, session) {
  if (!autoTradingEnabled || !signal) return { skipped: true, reason: 'auto_off' };

  const dayKey = istDayKey();
  const buyKey = `${dayKey}-${signal.side}-${signal.strike}-${signal.ts}`;
  if (buyKey === lastAutoBuyKey) return { skipped: true, reason: 'duplicate' };
  lastAutoBuyKey = buyKey;

  const open = openPositionsFromLogs(dayKey);
  if (open.length > 0) {
    return { skipped: true, reason: 'position_open' };
  }

  const body = {
    symbol: 'NIFTY',
    strike: signal.strike,
    optionType: signal.optionType,
    quantity: 1,
    entry: signal.entry,
    sl: signal.sl,
    tgt: signal.tgt,
    transactiontype: 'BUY',
  };

  const out = await placeBuyWithExits(body, session);
  const buy = out.buy ?? out;
  const logRow = appendOrderLog({
    dayKey,
    ts: Date.now(),
    action: 'BUY',
    mode: 'auto',
    trigger: 'signal',
    signalTs: signal.ts,
    strike: signal.strike,
    optionType: signal.optionType,
    lots: buy.lots ?? body.quantity,
    units: buy.brokerQuantity,
    lotsize: buy.lotsize,
    entry: signal.entry,
    sl: signal.sl,
    tgt: signal.tgt,
    ltp: signal.entry,
    orderId: buy.orderId,
    mock: buy.mock,
    status: buy.ok ? (buy.mock ? 'simulated' : 'open') : 'failed',
    message: buy.message || (buy.ok ? 'Auto buy on signal' : 'Auto buy failed'),
    tradingsymbol: buy.tradingsymbol,
    exchange: buy.exchange,
  });

  let targetSellLog = null;
  let stopLossSellLog = null;
  if (buy.ok && buy.broker === true && !buy.mock && out.targetSell?.ok) {
    const ts = out.targetSell;
    targetSellLog = appendOrderLog({
      dayKey,
      ts: Date.now(),
      action: 'SELL',
      mode: 'auto',
      trigger: 'target',
      parentBuyId: buy.orderId,
      strike: signal.strike,
      optionType: signal.optionType,
      lots: ts.lots ?? buy.lots,
      units: ts.brokerQuantity,
      lotsize: ts.lotsize,
      entry: signal.entry,
      sl: signal.sl,
      tgt: signal.tgt,
      exitPrice: signal.tgt,
      orderId: ts.orderId,
      mock: ts.mock,
      status: ts.ok ? (ts.mock ? 'target_pending' : 'submitted') : 'failed',
      message: ts.ok
        ? `Target sell LIMIT @ ${Number(signal.tgt).toFixed(2)}`
        : ts.message || 'Target sell placement failed',
      tradingsymbol: ts.tradingsymbol,
      exchange: ts.exchange,
    });
  }
  if (buy.ok && buy.broker === true && !buy.mock && out.stopLossSell?.ok) {
    const slOrder = out.stopLossSell;
    stopLossSellLog = appendOrderLog({
      dayKey,
      ts: Date.now(),
      action: 'SELL',
      mode: 'auto',
      trigger: 'stoploss',
      parentBuyId: buy.orderId,
      strike: signal.strike,
      optionType: signal.optionType,
      lots: slOrder.lots ?? buy.lots,
      units: slOrder.brokerQuantity,
      lotsize: slOrder.lotsize,
      entry: signal.entry,
      sl: signal.sl,
      tgt: signal.tgt,
      exitPrice: signal.sl,
      orderId: slOrder.orderId,
      mock: slOrder.mock,
      status: slOrder.ok ? 'submitted' : 'failed',
      message: slOrder.ok
        ? `Stop-loss sell STOPLOSS_LIMIT @ ${Number(signal.sl).toFixed(2)}`
        : slOrder.message || 'Stop-loss sell placement failed',
      tradingsymbol: slOrder.tradingsymbol,
      exchange: slOrder.exchange,
    });
  }

  return {
    skipped: false,
    ok: buy.ok,
    order: buy,
    log: logRow,
    targetSellLog,
    stopLossSellLog,
  };
}

/**
 * @param {object} pos
 * @param {number} ltp
 * @param {'target'|'stoploss'} trigger
 * @param {{ apiKey?: string, jwt?: string }} session
 */
async function exitPosition(pos, ltp, trigger, session) {
  const dayKey = istDayKey();
  const exitKey = `${pos.orderId}-${trigger}`;
  if (exitInFlight.has(exitKey)) return null;
  if (exitGaveUp.has(exitKey)) return null;
  exitInFlight.add(exitKey);

  try {
    const out = await placeOrder(
      {
        symbol: 'NIFTY',
        strike: pos.strike,
        optionType: pos.optionType,
        quantity: pos.lots ?? 1,
        entry: ltp,
        sl: pos.sl,
        tgt: pos.tgt,
        transactiontype: 'SELL',
      },
      session
    );

    const status = trigger === 'target' ? 'target_exit' : 'stoploss_exit';
    const triggerLabel = trigger === 'target' ? 'target' : 'stoploss';
    const logRow = appendOrderLog({
      dayKey,
      ts: Date.now(),
      action: 'SELL',
      mode: autoTradingEnabled ? 'auto' : 'manual',
      trigger: triggerLabel,
      parentBuyId: pos.orderId,
      strike: pos.strike,
      optionType: pos.optionType,
      lots: pos.lots,
      units: pos.units,
      lotsize: pos.lotsize,
      entry: pos.entry,
      sl: pos.sl,
      tgt: pos.tgt,
      exitPrice: ltp,
      ltp,
      orderId: out.orderId,
      mock: out.mock,
      status: out.ok ? status : 'failed',
      message: out.ok
        ? trigger === 'target'
          ? `Exit: LTP ${ltp.toFixed(2)} >= target ${Number(pos.tgt).toFixed(2)}`
          : `Exit: LTP ${ltp.toFixed(2)} <= stop-loss ${Number(pos.sl).toFixed(2)}`
        : out.message || 'Auto sell failed',
      tradingsymbol: out.tradingsymbol,
      exchange: out.exchange,
    });

    if (out.ok) {
      exitGaveUp.delete(exitKey);
      appendOrderLog({
        dayKey,
        ts: Date.now(),
        action: 'UPDATE',
        mode: autoTradingEnabled ? 'auto' : 'manual',
        trigger: triggerLabel,
        orderId: pos.orderId,
        parentBuyId: pos.orderId,
        strike: pos.strike,
        optionType: pos.optionType,
        status: 'closed',
        message:
          trigger === 'target'
            ? `Buy closed at target via sell ${out.orderId}`
            : `Buy closed at stop-loss via sell ${out.orderId}`,
      });
    } else {
      exitGaveUp.add(exitKey);
    }

    return { position: pos, trigger, out, log: logRow };
  } finally {
    exitInFlight.delete(exitKey);
  }
}

/**
 * Monitor open positions: sell when LTP >= target or LTP <= stop-loss.
 * @param {Array<{strike:number,ce?:{ltp:number},pe?:{ltp:number}}>} chainRows
 * @param {{ apiKey?: string, jwt?: string }} session
 */
export async function checkPositionExits(chainRows, session) {
  if (!Array.isArray(chainRows) || !chainRows.length) {
    return { checked: 0, exits: [] };
  }

  const dayKey = istDayKey();
  const open = openPositionsFromLogs(dayKey);
  const dayLogs = readDayLogs(dayKey);
  const exits = [];

  for (const pos of open) {
    const tgt = Number(pos.tgt);
    const sl = Number(pos.sl);
    const row = chainRows.find((r) => r.strike === pos.strike);
    if (!row) continue;
    const leg = pos.optionType === 'CE' ? row.ce : row.pe;
    const ltp = Number(leg?.ltp);
    if (!Number.isFinite(ltp)) continue;

    let trigger = null;
    if (Number.isFinite(sl) && sl > 0 && ltp <= sl) trigger = 'stoploss';
    else if (Number.isFinite(tgt) && tgt > 0 && ltp >= tgt) trigger = 'target';
    if (!trigger) continue;
    if (trigger === 'target' && hasPendingTargetSell(dayLogs, pos.orderId)) continue;

    const result = await exitPosition(pos, ltp, trigger, session);
    if (result) exits.push(result);
  }

  return { checked: open.length, exits };
}

/** @deprecated use checkPositionExits */
export async function autoSellOnTarget(chainRows, session) {
  return checkPositionExits(chainRows, session);
}

/** Reset daily dedupe at IST midnight boundary (caller can invoke on day change). */
export function resetDailyAutoKeys(dayKey = istDayKey()) {
  if (!lastAutoBuyKey.startsWith(dayKey)) {
    lastAutoBuyKey = '';
    exitGaveUp.clear();
  }
}
