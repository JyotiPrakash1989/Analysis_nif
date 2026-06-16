/**
 * Monitor open equity buys: mark target / stop-loss exits when live LTP crosses levels.
 */

import { appendOrderLog, istDayKey, readDayLogs } from './orderLog.mjs';
import { fetchEquitySnapshot } from './equityQuotes.mjs';

const OPEN_BUY_STATUSES = new Set(['open', 'submitted', 'simulated']);
const CLOSING_SELL_STATUSES = new Set(['target_exit', 'stoploss_exit', 'closed']);
const announcedExits = new Set();

function isEquityRow(row) {
  return row?.assetType === 'equity' || row?.optionType === 'EQ';
}

function openEquityPositions(dayKey) {
  const logs = readDayLogs(dayKey);
  const closedBuyIds = new Set(
    logs
      .filter(
        (r) =>
          r.action === 'SELL' &&
          r.parentBuyId &&
          CLOSING_SELL_STATUSES.has(r.status)
      )
      .map((r) => String(r.parentBuyId))
  );
  return logs.filter(
    (r) =>
      r.action === 'BUY' &&
      isEquityRow(r) &&
      OPEN_BUY_STATUSES.has(r.status) &&
      r.orderId &&
      !closedBuyIds.has(String(r.orderId))
  );
}

function hasClosingExit(logs, buyOrderId, trigger) {
  const id = String(buyOrderId);
  return logs.some(
    (r) =>
      r.action === 'SELL' &&
      String(r.parentBuyId) === id &&
      r.trigger === trigger &&
      CLOSING_SELL_STATUSES.has(r.status)
  );
}

function emitExit(io, row) {
  io?.emit?.('orderLog', row);
  io?.emit?.('equityOrderLog', row);
}

/**
 * @param {{ apiKey?: string, jwt?: string }} session
 * @param {{ emit?: (event: string, payload: unknown) => void }} [io]
 */
export async function checkEquityPositionExits(session, io = null) {
  const dayKey = istDayKey();
  const positions = openEquityPositions(dayKey);
  if (!positions.length) return { checked: 0, exits: [] };

  const logs = readDayLogs(dayKey);
  const exits = [];
  const symbols = [
    ...new Set(
      positions
        .map((p) => String(p.equitySymbol || '').toUpperCase())
        .filter(Boolean)
    ),
  ];

  const ltpBySymbol = new Map();
  for (const sym of symbols) {
    try {
      const snap = await fetchEquitySnapshot(session.apiKey, session.jwt, sym);
      if (snap?.ltp > 0) ltpBySymbol.set(sym, snap.ltp);
    } catch {
      /* skip symbol */
    }
  }

  for (const pos of positions) {
    const sym = String(pos.equitySymbol || '').toUpperCase();
    const ltp = ltpBySymbol.get(sym);
    if (!Number.isFinite(ltp)) continue;

    const sl = Number(pos.sl);
    const tgt = Number(pos.tgt);
    let trigger = null;
    if (Number.isFinite(sl) && sl > 0 && ltp <= sl) trigger = 'stoploss';
    else if (Number.isFinite(tgt) && tgt > 0 && ltp >= tgt) trigger = 'target';
    if (!trigger) continue;

    const exitKey = `${pos.orderId}-${trigger}`;
    if (announcedExits.has(exitKey)) continue;
    if (hasClosingExit(logs, pos.orderId, trigger)) continue;
    announcedExits.add(exitKey);

    const status = trigger === 'target' ? 'target_exit' : 'stoploss_exit';
    const sellLog = appendOrderLog({
      dayKey,
      ts: Date.now(),
      assetType: 'equity',
      equitySymbol: sym,
      action: 'SELL',
      mode: pos.mode || 'manual',
      trigger,
      parentBuyId: pos.orderId,
      optionType: 'EQ',
      strike: 0,
      lots: pos.lots ?? 1,
      units: pos.units ?? 1,
      lotsize: 1,
      entry: pos.entry,
      sl: pos.sl,
      tgt: pos.tgt,
      exitPrice: ltp,
      ltp,
      orderId: `eq-exit-${pos.orderId}-${trigger}`,
      mock: pos.mock,
      status,
      message:
        trigger === 'target'
          ? `Exit: LTP ${ltp.toFixed(2)} >= target ${Number(tgt).toFixed(2)}`
          : `Exit: LTP ${ltp.toFixed(2)} <= stop-loss ${Number(sl).toFixed(2)}`,
      tradingsymbol: pos.tradingsymbol,
      exchange: pos.exchange,
    });

    const updateLog = appendOrderLog({
      dayKey,
      ts: Date.now(),
      assetType: 'equity',
      equitySymbol: sym,
      action: 'UPDATE',
      mode: pos.mode || 'manual',
      trigger,
      orderId: pos.orderId,
      parentBuyId: pos.orderId,
      optionType: 'EQ',
      strike: 0,
      status: 'closed',
      message:
        trigger === 'target'
          ? 'Buy closed at target'
          : 'Buy closed at stop-loss',
    });

    emitExit(io, sellLog);
    emitExit(io, updateLog);
    exits.push({ position: pos, trigger, sellLog, updateLog });
  }

  return { checked: positions.length, exits };
}

export function resetEquityExitKeys(dayKey = istDayKey()) {
  for (const key of [...announcedExits]) {
    if (!key.includes(String(dayKey))) announcedExits.delete(key);
  }
}
