/**
 * Place intraday equity orders via mStock Type B.
 * After successful BUY, places separate target LIMIT and stop-loss SELL orders.
 */

import { httpsJsonRequest } from './mstockHttps.mjs';
import { quoteHeaders } from './niftyQuote.mjs';
import {
  extractMstockBrokerMessage,
  hasMstockSessionJwt,
  isMstockResponseOk,
  parseMstockOrderId,
} from './mstockErrors.mjs';
import { reconcileOrderFromBook } from './mstockOrderReconcile.mjs';
import { resolveEquityToken } from './equityQuotes.mjs';

const PLACE_ORDER_PATH = '/openapi/typeb/orders/regular';

function roundPrice(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return (Math.round(n * 100) / 100).toFixed(2);
}

function bracketLegs(entry, sl, tgt) {
  const e = Number(entry);
  const s = Number(sl);
  const t = Number(tgt);
  if (!Number.isFinite(e) || e <= 0 || !Number.isFinite(s) || s <= 0 || !Number.isFinite(t) || t <= e || s >= e) {
    return { stoploss: '0', squareoff: '0', useBracket: false };
  }
  const slPts = Math.round((e - s) * 100) / 100;
  const tgtPts = Math.round((t - e) * 100) / 100;
  if (slPts <= 0 || tgtPts <= 0) return { stoploss: '0', squareoff: '0', useBracket: false };
  return { stoploss: slPts.toFixed(2), squareoff: tgtPts.toFixed(2), useBracket: true };
}

function parseOrderResponse(text, statusCode) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: `Broker response not JSON (HTTP ${statusCode})` };
  }
  if (!isMstockResponseOk(json)) {
    const { message, errorcode } = extractMstockBrokerMessage(json);
    return { ok: false, message: message || 'Order rejected', errorcode };
  }
  const orderId = parseMstockOrderId(json) ?? undefined;
  return { ok: true, orderId, message: 'SUCCESS' };
}

function isConfirmedEquityBuy(out) {
  if (!out?.ok || out.transactiontype !== 'BUY') return false;
  const id = String(out.orderId ?? '').trim();
  if (!id || id.startsWith('MOCK-')) return false;
  return out.broker === true && !out.mock;
}

function shouldPlaceExitOrders(buyOut) {
  return buyOut?.ok && buyOut.transactiontype === 'BUY';
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ apiKey?: string, jwt?: string }} session
 */
export async function placeEquityOrder(body, session = {}) {
  const symbol = String(body.symbol ?? '').trim().toUpperCase();
  const qty = Math.max(1, Math.floor(Number(body.quantity) || 1));
  const entry = Number(body.entry);
  const sl = Number(body.sl);
  const tgt = Number(body.tgt);
  const transactiontype =
    String(body.transactiontype || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
  const varietyOverride = String(body.variety || body.varietyOverride || '').toUpperCase();
  const orderTypeOverride = String(body.ordertype || body.orderType || body.orderTypeOverride || '').toUpperCase();
  const triggerOverride = body.triggerprice ?? body.triggerPrice;
  const productOverride = String(body.producttype || body.productType || '').toUpperCase();

  if (!symbol) return { ok: false, status: 400, message: 'symbol required' };
  if (!Number.isFinite(entry) || entry <= 0) {
    return { ok: false, status: 400, message: 'entry price must be positive' };
  }

  const apiKey = String(session.apiKey ?? '').trim().replace(/^\uFEFF/, '');
  const jwt = String(session.jwt ?? '').trim();
  const canBroker = hasMstockSessionJwt(jwt, apiKey);

  if (canBroker) {
    try {
      const leg = await resolveEquityToken(apiKey, jwt, symbol);
      if (!leg) {
        return { ok: false, status: 404, message: `${symbol} not found in NSE scrip master` };
      }

      const defaultOrderType = String(process.env.MSTOCK_EQUITY_ORDER_TYPE || 'LIMIT').toUpperCase();
      const orderType = orderTypeOverride || defaultOrderType;
      const producttype =
        productOverride || String(process.env.MSTOCK_EQUITY_PRODUCT || 'INTRADAY').toUpperCase();
      const bracket = bracketLegs(entry, sl, tgt);
      const attachLegs = transactiontype === 'BUY' && bracket.useBracket;
      const isStopOrder = orderType === 'STOPLOSS_LIMIT' || orderType === 'STOPLOSS_MARKET';
      const price =
        orderType === 'MARKET' || orderType === 'STOPLOSS_MARKET' ? '0' : roundPrice(entry);
      const triggerPx =
        triggerOverride != null && Number.isFinite(Number(triggerOverride))
          ? roundPrice(Number(triggerOverride))
          : isStopOrder
            ? price
            : '0';

      const payload = {
        variety: varietyOverride || (isStopOrder ? 'STOPLOSS' : 'NORMAL'),
        tradingsymbol: leg.tradingsymbol,
        symboltoken: leg.token,
        exchange: leg.exchange || 'NSE',
        transactiontype,
        ordertype: orderType,
        quantity: String(qty),
        producttype,
        price,
        triggerprice: triggerPx,
        squareoff: attachLegs ? bracket.squareoff : '0',
        stoploss: attachLegs ? bracket.stoploss : '0',
        trailingStopLoss: '0',
        disclosedquantity: '0',
        duration: 'DAY',
        ordertag: transactiontype === 'SELL' ? 'niftyoptima-equity-exit' : 'niftyoptima-equity',
      };

      const headers = { ...quoteHeaders(apiKey, jwt), 'Content-Type': 'application/json' };
      const { statusCode, text } = await httpsJsonRequest('POST', PLACE_ORDER_PATH, payload, headers);
      let parsed = parseOrderResponse(text, statusCode);
      if (!parsed.ok || !parsed.orderId) {
        const reconciled = await reconcileOrderFromBook(apiKey, jwt, {
          tradingsymbol: leg.tradingsymbol,
          transactiontype,
          quantity: qty,
        });
        if (reconciled?.orderId) {
          parsed = {
            ok: true,
            orderId: reconciled.orderId,
            message: reconciled.message || parsed.message || 'SUCCESS',
          };
        } else if (!parsed.ok) {
          return {
            ok: false,
            status: statusCode >= 400 ? statusCode : 400,
            message: parsed.message,
            symbol,
            quantity: qty,
            tradingsymbol: leg.tradingsymbol,
            exchange: leg.exchange,
          };
        } else {
          return {
            ok: false,
            status: 502,
            message: 'Broker accepted but no order id',
            symbol,
            quantity: qty,
            tradingsymbol: leg.tradingsymbol,
            exchange: leg.exchange,
          };
        }
      }

      return {
        ok: true,
        mock: false,
        broker: true,
        orderId: parsed.orderId,
        symbol,
        quantity: qty,
        units: qty,
        lotsize: 1,
        entry,
        sl,
        tgt,
        tradingsymbol: leg.tradingsymbol,
        exchange: leg.exchange || 'NSE',
        producttype,
        orderType,
        transactiontype,
        message: `${parsed.message} · ${transactiontype} ${qty} qty · ${leg.tradingsymbol}`,
      };
    } catch (e) {
      return { ok: false, status: 502, message: e instanceof Error ? e.message : String(e), symbol };
    }
  }

  const mockId = `MOCK-EQ-${transactiontype}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    ok: true,
    mock: true,
    broker: false,
    orderId: mockId,
    symbol,
    quantity: qty,
    units: qty,
    lotsize: 1,
    entry,
    sl,
    tgt,
    tradingsymbol: `${symbol}-EQ`,
    exchange: 'NSE',
    producttype: 'INTRADAY',
    transactiontype,
    message: canBroker
      ? `Simulated equity ${transactiontype}`
      : `Simulated equity ${transactiontype} — log in with mStock OTP for live orders`,
  };
}

/** Place target LIMIT sell and stop-loss sell after buy succeeds. */
async function placeEquityExits(body, buyOut, session) {
  const quantity = Math.max(1, Math.floor(Number(body.quantity) || buyOut.quantity || 1));
  const producttype = buyOut.producttype || String(process.env.MSTOCK_EQUITY_PRODUCT || 'INTRADAY').toUpperCase();
  const common = { symbol: body.symbol ?? buyOut.symbol, quantity, producttype };

  let targetSellOut = null;
  let stopLossSellOut = null;

  const tgt = Number(body.tgt ?? buyOut.tgt);
  if (Number.isFinite(tgt) && tgt > 0) {
    targetSellOut = await placeEquityOrder(
      {
        ...common,
        entry: tgt,
        sl: body.sl ?? buyOut.sl,
        tgt,
        transactiontype: 'SELL',
        orderType: 'LIMIT',
        variety: 'NORMAL',
      },
      session
    );
  }

  const slPx = Number(body.sl ?? buyOut.sl);
  if (Number.isFinite(slPx) && slPx > 0) {
    stopLossSellOut = await placeEquityOrder(
      {
        ...common,
        entry: slPx,
        sl: slPx,
        tgt: body.tgt ?? buyOut.tgt,
        transactiontype: 'SELL',
        variety: 'STOPLOSS',
        orderType: 'STOPLOSS_LIMIT',
        triggerprice: slPx,
      },
      session
    );
  }

  return { targetSellOut, stopLossSellOut };
}

/** Place equity BUY then target + stop-loss SELL orders on success. */
export async function placeEquityBuyWithExits(body, session = {}) {
  const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
  const buyOut = await placeEquityOrder({ ...body, quantity, transactiontype: 'BUY' }, session);

  let targetSellOut = null;
  let stopLossSellOut = null;

  if (shouldPlaceExitOrders(buyOut)) {
    const exits = await placeEquityExits(body, buyOut, session);
    targetSellOut = exits.targetSellOut;
    stopLossSellOut = exits.stopLossSellOut;
  }

  const exitNote = [];
  if (targetSellOut?.ok) exitNote.push(`target @ ${Number(body.tgt ?? buyOut.tgt).toFixed(2)}`);
  if (stopLossSellOut?.ok) exitNote.push(`SL @ ${Number(body.sl ?? buyOut.sl).toFixed(2)}`);
  const buyMessage =
    exitNote.length > 0
      ? `${buyOut.message} · Exit orders: ${exitNote.join(', ')}`
      : buyOut.message;

  return {
    ...buyOut,
    ok: buyOut.ok,
    message: buyMessage,
    buy: { ...buyOut, message: buyMessage },
    targetSell: targetSellOut,
    stopLossSell: stopLossSellOut,
    targetSellOrderId: targetSellOut?.orderId,
    stopLossSellOrderId: stopLossSellOut?.orderId,
    targetSellOk: targetSellOut?.ok ?? false,
    stopLossSellOk: stopLossSellOut?.ok ?? false,
    exitsPlaced: Boolean(targetSellOut?.ok || stopLossSellOut?.ok),
    isLiveBuy: isConfirmedEquityBuy(buyOut),
  };
}
