/**
 * When place-order JSON parsing fails, confirm against the live mStock order book.
 */

import { httpsGet } from './mstockHttps.mjs';
import { quoteHeaders } from './niftyQuote.mjs';
import { isMstockResponseOk, mapMstockOrderBookStatus, parseMstockOrderId } from './mstockErrors.mjs';

const ORDERS_PATH = '/openapi/typeb/orders';

/** @param {unknown} json */
function orderBookRows(json) {
  const data = json?.data ?? json?.Data;
  return Array.isArray(data) ? data : [];
}

/**
 * @param {string} apiKey
 * @param {string} jwt
 * @param {{ tradingsymbol: string, transactiontype?: string, quantity?: number|string }} match
 */
export async function reconcileOrderFromBook(apiKey, jwt, match) {
  const symbol = String(match.tradingsymbol ?? '').trim().toUpperCase();
  if (!symbol) return null;
  const tx = String(match.transactiontype ?? 'BUY').trim().toUpperCase();
  const qty = Number(match.quantity);
  const wantQty = Number.isFinite(qty) && qty > 0 ? qty : null;

  try {
    const headers = quoteHeaders(apiKey, jwt);
    const { statusCode, text } = await httpsGet(ORDERS_PATH, headers);
    if (statusCode !== 200) return null;
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return null;
    }
    if (!isMstockResponseOk(json)) return null;

    const now = Date.now();
    const candidates = orderBookRows(json)
      .map((row) => {
        const tradingsymbol = String(row?.tradingsymbol ?? '').trim().toUpperCase();
        if (tradingsymbol !== symbol) return null;
        const rowTx = String(row?.transactiontype ?? '').trim().toUpperCase();
        if (rowTx !== tx) return null;
        const orderId = parseMstockOrderId({ data: row }) ?? pickRowOrderId(row);
        if (!orderId) return null;
        const brokerStatus = String(row?.status ?? row?.orderstatus ?? '').trim();
        if (/reject|cancel/i.test(brokerStatus)) return null;
        const rowQty = Number(row?.quantity ?? row?.filledshares ?? 0);
        if (wantQty != null && Number.isFinite(rowQty) && rowQty > 0 && rowQty !== wantQty) {
          return null;
        }
        const ts = parseBrokerOrderTs(row?.updatetime ?? row?.exchorderupdatetime ?? row?.exchtime);
        return { orderId, brokerStatus, ts, row };
      })
      .filter(Boolean);

    if (!candidates.length) return null;

    candidates.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const best = candidates.find((c) => !c.ts || now - c.ts <= 5 * 60 * 1000) ?? candidates[0];
    return {
      orderId: best.orderId,
      status: mapMstockOrderBookStatus(best.brokerStatus),
      message: 'Order confirmed from mStock order book',
    };
  } catch {
    return null;
  }
}

/** @param {unknown} row */
function pickRowOrderId(row) {
  if (!row || typeof row !== 'object') return null;
  for (const key of ['orderid', 'orderId', 'uniqueorderid', 'exchangeorderid']) {
    const v = row[key];
    if (v == null) continue;
    const id = String(v).trim();
    if (id) return id;
  }
  return null;
}

/** @param {unknown} raw */
function parseBrokerOrderTs(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return 0;
  const d = new Date(t.replace(' ', 'T'));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** @param {string} tradingsymbol */
function parseNiftyOptionSymbol(tradingsymbol) {
  const t = String(tradingsymbol ?? '').trim().toUpperCase();
  const m = t.match(/NIFTY.*?(\d{4,5})(CE|PE)$/);
  if (!m) return null;
  const strike = Number(m[1]);
  if (!Number.isFinite(strike) || strike <= 0) return null;
  return { strike, optionType: m[2] };
}

/** @param {string} tradingsymbol */
function parseEquitySymbol(tradingsymbol) {
  const sym = String(tradingsymbol ?? '').trim().toUpperCase();
  if (!sym) return null;
  if (sym.endsWith('-EQ')) return sym.slice(0, -3);
  return sym.includes('NIFTY') ? null : sym;
}

/**
 * Recover failed rows and import live BUYs missing from the session log.
 * @param {Array<Record<string, unknown>>} logs
 * @param {Array<Record<string, unknown>>} bookRows
 * @param {string} [dayKey]
 */
export function mergeOrderBookIntoLogs(logs, bookRows, dayKey = '') {
  if (!Array.isArray(logs) || !Array.isArray(bookRows) || !bookRows.length) return logs;

  const liveBuys = new Map();
  for (const row of bookRows) {
    if (String(row?.transactiontype ?? '').trim().toUpperCase() !== 'BUY') continue;
    const tradingsymbol = String(row?.tradingsymbol ?? '').trim().toUpperCase();
    if (!tradingsymbol) continue;
    const orderId = parseMstockOrderId({ data: row }) ?? pickRowOrderId(row);
    if (!orderId) continue;
    const brokerStatus = String(row?.status ?? row?.orderstatus ?? '').trim();
    if (/reject|cancel/i.test(brokerStatus)) continue;
    const mapped = mapMstockOrderBookStatus(brokerStatus);
    const appStatus = mapped === 'submitted' ? 'open' : mapped;
    liveBuys.set(tradingsymbol, {
      orderId,
      status: appStatus,
      row,
      price:
        Number(row?.averageprice ?? row?.price ?? row?.ltp ?? 0) || 0,
      qty: Number(row?.quantity ?? row?.filledshares ?? 1) || 1,
      ts: parseBrokerOrderTs(row?.updatetime ?? row?.exchorderupdatetime ?? row?.exchtime),
    });
  }

  if (!liveBuys.size) return logs;

  const knownOrderIds = new Set(
    logs.filter((l) => l.orderId).map((l) => String(l.orderId))
  );

  let out = logs.map((log) => {
    if (log.action !== 'BUY' || log.status !== 'failed') return log;
    const sym = String(
      log.tradingsymbol ??
        (log.equitySymbol ? `${log.equitySymbol}-EQ` : '') ??
        ''
    )
      .trim()
      .toUpperCase();
    if (!sym) return log;
    const hit = liveBuys.get(sym);
    if (!hit) return log;
    knownOrderIds.add(hit.orderId);
    return {
      ...log,
      orderId: hit.orderId,
      status: hit.status,
      mock: false,
      message: 'Recovered from mStock order book (order was placed at broker)',
    };
  });

  for (const [tradingsymbol, hit] of liveBuys) {
    if (knownOrderIds.has(hit.orderId)) continue;
    const nifty = parseNiftyOptionSymbol(tradingsymbol);
    const equitySymbol = nifty ? null : parseEquitySymbol(tradingsymbol);
    if (!nifty && !equitySymbol) continue;

    knownOrderIds.add(hit.orderId);
    out.push({
      id: `book-${hit.orderId}`,
      ts: hit.ts || Date.now(),
      dayKey: dayKey || '',
      action: 'BUY',
      mode: 'manual',
      trigger: 'manual',
      strike: nifty?.strike ?? 0,
      optionType: nifty?.optionType ?? 'EQ',
      assetType: equitySymbol ? 'equity' : undefined,
      equitySymbol: equitySymbol ?? undefined,
      lots: 1,
      units: hit.qty,
      lotsize: nifty ? 75 : 1,
      entry: hit.price,
      sl: 0,
      tgt: 0,
      ltp: hit.price,
      orderId: hit.orderId,
      mock: false,
      status: hit.status,
      message: 'Synced from mStock order book',
      tradingsymbol,
      exchange: String(hit.row?.exchange ?? ''),
    });
  }

  return out.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
