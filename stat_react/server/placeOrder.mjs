/**
 * placeOrder: never expose secrets to the browser — call only from this server.
 * Uses mStock Type B session JWT when available; otherwise simulates a fill.
 * @see https://tradingapi.mstock.com/docs/v1/typeB/Orders/
 */

import { httpsJsonRequest } from './mstockHttps.mjs';
import { defaultNiftyLotSize, findNiftyOptionInstrument } from './mstockScripMaster.mjs';
import {
  extractMstockBrokerMessage,
  hasMstockSessionJwt,
  isMstockResponseOk,
  parseMstockOrderId,
} from './mstockErrors.mjs';
import { reconcileOrderFromBook } from './mstockOrderReconcile.mjs';
import { quoteHeaders } from './niftyQuote.mjs';

const PLACE_ORDER_PATH = '/openapi/typeb/orders/regular';

/** @param {{ lots: number, lotsize: number, units: number, tradingsymbol: string, exchange: string }} ctx */
function formatOrderContext(ctx) {
  return `${ctx.lots} lot${ctx.lots > 1 ? 's' : ''} × ${ctx.lotsize} = ${ctx.units} qty · ${ctx.tradingsymbol} · ${ctx.exchange}`;
}

/** @param {string} brokerMsg @param {{ lots: number, lotsize: number, units: number, tradingsymbol: string, exchange: string }} ctx */
function formatOrderError(brokerMsg, ctx) {
  const base = brokerMsg?.trim() || 'Order rejected by broker';
  const ctxLine = formatOrderContext(ctx);
  if (base.includes(ctx.tradingsymbol) || base.includes(String(ctx.units))) return base;
  return `${base} · ${ctxLine}`;
}

function roundOptionPrice(entry) {
  const tick = Number(process.env.MSTOCK_TICK_SIZE || 0.05);
  const t = Number.isFinite(tick) && tick > 0 ? tick : 0.05;
  return Math.round(entry / t) * t;
}

/** SL/target as point distance from entry (mStock bracket leg convention). */
function bracketLegs(entry, sl, tgt, transactiontype) {
  const e = Number(entry);
  const s = Number(sl);
  const t = Number(tgt);
  if (transactiontype !== 'BUY' || !Number.isFinite(e) || e <= 0) {
    return { stoploss: '0', squareoff: '0', useBracket: false };
  }
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(t) || t <= 0 || t <= e || s >= e) {
    return { stoploss: '0', squareoff: '0', useBracket: false };
  }
  const slPts = roundOptionPrice(e - s);
  const tgtPts = roundOptionPrice(t - e);
  if (slPts <= 0 || tgtPts <= 0) {
    return { stoploss: '0', squareoff: '0', useBracket: false };
  }
  return {
    stoploss: slPts.toFixed(2),
    squareoff: tgtPts.toFixed(2),
    useBracket: true,
  };
}

/** BO product is rejected on NFO/BFO — attach legs on CARRYFORWARD instead. */
function useBoProduct(exchange) {
  if (process.env.MSTOCK_BRACKET_ORDER === '0') return false;
  if (exchange === 'NFO' || exchange === 'BFO') return false;
  return process.env.MSTOCK_BRACKET_ORDER === '1' || process.env.MSTOCK_BRACKET_ORDER === 'true';
}

function attachBracketLegsOnBuy() {
  return process.env.MSTOCK_ATTACH_SL_TGT !== '0';
}

function placeTargetSellOnBuy() {
  return process.env.MSTOCK_PLACE_TARGET_SELL !== '0';
}

function placeStopLossSellOnBuy() {
  return process.env.MSTOCK_PLACE_SL_SELL !== '0';
}

/** True only when the buy was accepted by mStock with a real order id. */
function isConfirmedBuyFill(out) {
  if (!out?.ok || out.mock || out.broker !== true) return false;
  const id = String(out.orderId ?? '').trim();
  if (!id || id.startsWith('MOCK-') || id.startsWith('mstock-')) return false;
  return true;
}

function resolveProductType(exchange, useBo) {
  const defaultProduct =
    exchange === 'NFO' || exchange === 'BFO' ? 'CARRYFORWARD' : 'INTRADAY';
  if (useBo) return 'BO';
  const configured = String(process.env.MSTOCK_ORDER_PRODUCT || defaultProduct).toUpperCase();
  if (exchange === 'NFO' || exchange === 'BFO') {
    const allowed = new Set(['CARRYFORWARD', 'INTRADAY', 'MARGIN', 'DELIVERY']);
    return allowed.has(configured) ? configured : 'CARRYFORWARD';
  }
  return configured;
}

function parseOrderResponse(text, statusCode) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const snippet = String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    const hint =
      statusCode === 405
        ? 'Broker rejected HTTP method — retry after server restart.'
        : snippet || 'empty response';
    return { ok: false, message: `Broker response not JSON (HTTP ${statusCode}): ${hint}` };
  }
  const brokerOk = isMstockResponseOk(json);
  const { message: brokerMsg, errorcode } = extractMstockBrokerMessage(json);

  if (!brokerOk) {
    let message =
      brokerMsg || (errorcode ? `Order rejected (${errorcode})` : 'Order rejected by broker');
    if (message.length > 600) message = `${message.slice(0, 600)}…`;
    return { ok: false, message, errorcode };
  }

  const orderId = parseMstockOrderId(json) ?? undefined;
  return {
    ok: true,
    orderId,
    message: brokerMsg || 'SUCCESS',
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ apiKey?: string, jwt?: string }} session
 */
export async function placeOrder(body, session = {}) {
  const symbol = String(body.symbol ?? 'NIFTY');
  const strike = Number(body.strike);
  const optionType = body.optionType === 'PE' ? 'PE' : body.optionType === 'CE' ? 'CE' : null;
  const lots = Math.max(1, Math.floor(Number(body.quantity) || 1));
  const entry = Number(body.entry);
  const sl = Number(body.sl);
  const tgt = Number(body.tgt);
  const transactiontype =
    String(body.transactiontype || body.transactionType || 'BUY').toUpperCase() === 'SELL'
      ? 'SELL'
      : 'BUY';
  const varietyOverride = String(body.variety || body.varietyOverride || '').toUpperCase();
  const orderTypeOverride = String(
    body.ordertype || body.orderType || body.orderTypeOverride || ''
  ).toUpperCase();
  const triggerOverride = body.triggerprice ?? body.triggerPrice;

  if (!Number.isFinite(strike) || strike <= 0 || !optionType) {
    return { ok: false, status: 400, message: 'strike and optionType (CE|PE) are required' };
  }
  if (!Number.isFinite(entry) || entry <= 0) {
    return { ok: false, status: 400, message: 'entry premium must be a positive number' };
  }

  const apiKey = String(session.apiKey ?? '').trim().replace(/^\uFEFF/, '');
  const jwt = String(session.jwt ?? '').trim();
  const canBroker = hasMstockSessionJwt(jwt, apiKey);
  const requireBroker =
    body.requireBroker === true ||
    body.requireBroker === 1 ||
    String(body.requireBroker ?? '').toLowerCase() === 'true';

  if (!canBroker && requireBroker) {
    const clientSentJwt = Boolean(
      String(body.jwt ?? body.accessToken ?? body.mstockJwt ?? '').trim()
    );
    return {
      ok: false,
      status: 401,
      message: clientSentJwt
        ? 'mStock session expired or invalid — log in with SMS OTP in the mobile app and try again.'
        : 'mStock login required — complete SMS OTP login in the mobile app before placing orders.',
    };
  }

  if (canBroker) {
    try {
      const leg = await findNiftyOptionInstrument(apiKey, jwt, strike, optionType);
      if (!leg) {
        return {
          ok: false,
          status: 404,
          message: `No NIFTY ${strike} ${optionType} contract in scrip master for this weekly expiry`,
        };
      }

      const lotsize = leg.lotsize;
      const units = lots * lotsize;
      if (!Number.isFinite(units) || units < 1) {
        return {
          ok: false,
          status: 400,
          message: `Invalid order size: ${lots} lot(s) × ${lotsize} units/lot`,
        };
      }
      const orderCtx = {
        lots,
        lotsize,
        units,
        tradingsymbol: leg.tradingsymbol,
        exchange: leg.exchange,
      };
      const qty = String(units);
      const orderType =
        orderTypeOverride || (process.env.MSTOCK_ORDER_TYPE || 'LIMIT').toUpperCase();
      const bracket = bracketLegs(entry, sl, tgt, transactiontype);
      const attachLegs =
        transactiontype === 'BUY' && bracket.useBracket && attachBracketLegsOnBuy();
      const boProduct = useBoProduct(leg.exchange) && attachLegs;
      const producttype =
        String(body.producttype || body.productType || '').toUpperCase() ||
        resolveProductType(leg.exchange, boProduct);
      const price =
        orderType === 'MARKET' || orderType === 'STOPLOSS_MARKET'
          ? '0'
          : roundOptionPrice(entry).toFixed(2);
      const triggerPx =
        triggerOverride != null && Number.isFinite(Number(triggerOverride))
          ? roundOptionPrice(Number(triggerOverride)).toFixed(2)
          : '0';
      const ordertag =
        transactiontype === 'SELL' ? 'niftyoptima-exit' : 'niftyoptima';

      const payload = {
        variety: varietyOverride || 'NORMAL',
        tradingsymbol: leg.tradingsymbol,
        symboltoken: leg.symboltoken,
        exchange: leg.exchange,
        transactiontype,
        ordertype: orderType,
        quantity: qty,
        producttype,
        price,
        triggerprice: triggerPx,
        squareoff: attachLegs ? bracket.squareoff : '0',
        stoploss: attachLegs ? bracket.stoploss : '0',
        trailingStopLoss: '0',
        // 0 = no iceberg slice; must be < quantity (equal to qty returns IA400).
        disclosedquantity: '0',
        duration: 'DAY',
        ordertag,
      };

      const headers = {
        ...quoteHeaders(apiKey, jwt),
        'Content-Type': 'application/json',
      };
      // Official @mstock-mirae-asset/nodetradingapi-typeb uses POST (GET returns HTTP 405).
      let statusCode = 0;
      let text = '';
      let parsed = { ok: false, message: 'Order request failed' };
      try {
        ({ statusCode, text } = await httpsJsonRequest('POST', PLACE_ORDER_PATH, payload, headers));
        parsed = parseOrderResponse(text, statusCode);
      } catch (e) {
        return {
          ok: false,
          status: 502,
          message: e instanceof Error ? e.message : String(e),
        };
      }
      if (!parsed.ok) {
        const reconciled = await reconcileOrderFromBook(apiKey, jwt, {
          tradingsymbol: leg.tradingsymbol,
          transactiontype,
          quantity: units,
        });
        if (reconciled?.orderId) {
          parsed = {
            ok: true,
            orderId: reconciled.orderId,
            message: reconciled.message || parsed.message || 'SUCCESS',
          };
        } else {
          return {
            ok: false,
            status: statusCode >= 400 ? statusCode : 400,
            message: formatOrderError(parsed.message, orderCtx),
            errorcode: parsed.errorcode,
            ...orderCtx,
            brokerQuantity: units,
          };
        }
      }

      const bracketNote = attachLegs
        ? ` · SL ${bracket.stoploss} pts · target ${bracket.squareoff} pts on ${producttype}`
        : '';
      if (!parsed.orderId) {
        const reconciled = await reconcileOrderFromBook(apiKey, jwt, {
          tradingsymbol: leg.tradingsymbol,
          transactiontype,
          quantity: units,
        });
        if (reconciled?.orderId) {
          parsed = {
            ok: true,
            orderId: reconciled.orderId,
            message: reconciled.message || parsed.message || 'SUCCESS',
          };
        } else {
          return {
            ok: false,
            status: 502,
            message: `Broker accepted response but no order id — check mStock order book. ${parsed.message}`,
            ...orderCtx,
            brokerQuantity: units,
          };
        }
      }
      return {
        ok: true,
        mock: false,
        broker: true,
        orderId: parsed.orderId,
        symbol,
        strike,
        optionType,
        quantity: lots,
        lots,
        lotsize,
        brokerQuantity: units,
        entry,
        sl,
        tgt,
        tradingsymbol: leg.tradingsymbol,
        exchange: leg.exchange,
        producttype,
        orderType,
        price,
        transactiontype,
        bracketStoploss: attachLegs ? bracket.stoploss : undefined,
        bracketSquareoff: attachLegs ? bracket.squareoff : undefined,
        message: `${parsed.message} · ${transactiontype} · ${formatOrderContext(orderCtx)}${bracketNote}`,
      };
    } catch (e) {
      return {
        ok: false,
        status: 502,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  if (process.env.MSTOCK_USE_SDK === 'true') {
    try {
      await import('@mstock-mirae-asset/nodetradingapi-typea');
      return {
        ok: false,
        status: 501,
        message:
          'SDK loaded: implement MConnect session + placeOrder per tradingapi.mstock.com docs.',
        hint: { symbol, strike, optionType, quantity: lots, entry, sl, tgt },
      };
    } catch (e) {
      return { ok: false, status: 500, message: `SDK load failed: ${e.message}` };
    }
  }

  const lotsize = defaultNiftyLotSize();
  const units = lots * lotsize;
  const bracket = bracketLegs(entry, sl, tgt, transactiontype);
  const attachLegs = transactiontype === 'BUY' && bracket.useBracket && attachBracketLegsOnBuy();
  const bracketNote = attachLegs
    ? ` · SL ${bracket.stoploss} pts · target ${bracket.squareoff} pts`
    : '';
  return {
    ok: true,
    mock: true,
    broker: false,
    orderId: `MOCK-${Date.now()}`,
    symbol,
    strike,
    optionType,
    transactiontype,
    quantity: lots,
    lots,
    lotsize,
    brokerQuantity: units,
    entry,
    sl,
    tgt,
    tradingsymbol: `NIFTY${strike}${optionType}`,
    exchange: 'NFO',
    producttype: 'CARRYFORWARD',
    bracketStoploss: attachLegs ? bracket.stoploss : undefined,
    bracketSquareoff: attachLegs ? bracket.squareoff : undefined,
    message: canBroker
      ? `Simulated ${transactiontype} fill.${bracketNote}`
      : `Simulated ${transactiontype} fill — log in with mStock OTP so orders route to the broker.${bracketNote}`,
  };
}

/**
 * Place BUY with SL legs on the purchase order, then broker SL + target SELL orders.
 * @param {Record<string, unknown>} body
 * @param {{ apiKey?: string, jwt?: string }} session
 */
export async function placeBuyWithExits(body, session = {}) {
  const buyOut = await placeOrder({ ...body, transactiontype: 'BUY' }, session);
  let targetSellOut = null;
  let stopLossSellOut = null;

  if (!isConfirmedBuyFill(buyOut)) {
    return {
      ...buyOut,
      ok: buyOut.ok,
      buy: buyOut,
      targetSell: null,
      stopLossSell: null,
      targetSellOrderId: undefined,
      stopLossSellOrderId: undefined,
      targetSellOk: false,
      stopLossSellOk: false,
    };
  }

  const producttype = buyOut.producttype || 'CARRYFORWARD';
  const common = {
    symbol: body.symbol ?? buyOut.symbol,
    strike: body.strike ?? buyOut.strike,
    optionType: body.optionType ?? buyOut.optionType,
    quantity: body.quantity ?? buyOut.lots ?? buyOut.quantity,
    producttype,
  };

  if (placeTargetSellOnBuy()) {
    const tgt = Number(body.tgt ?? buyOut.tgt);
    if (Number.isFinite(tgt) && tgt > 0) {
      targetSellOut = await placeOrder(
        {
          ...common,
          entry: tgt,
          sl: body.sl ?? buyOut.sl,
          tgt,
          transactiontype: 'SELL',
        },
        session
      );
    }
  }

  if (placeStopLossSellOnBuy()) {
    const slPx = Number(body.sl ?? buyOut.sl);
    if (Number.isFinite(slPx) && slPx > 0) {
      stopLossSellOut = await placeOrder(
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
  }

  return {
    ...buyOut,
    ok: buyOut.ok,
    buy: buyOut,
    targetSell: targetSellOut,
    stopLossSell: stopLossSellOut,
    targetSellOrderId: targetSellOut?.orderId,
    stopLossSellOrderId: stopLossSellOut?.orderId,
    targetSellOk: targetSellOut?.ok ?? false,
    stopLossSellOk: stopLossSellOut?.ok ?? false,
  };
}

/**
 * Cancel a pending mStock order.
 * @param {string} orderId
 * @param {{ apiKey?: string, jwt?: string }} session
 * @param {{ variety?: string }} [opts]
 */
export async function cancelOrder(orderId, session = {}, opts = {}) {
  const id = String(orderId ?? '').trim();
  if (!id) {
    return { ok: false, status: 400, message: 'orderId is required' };
  }

  if (id.startsWith('MOCK-')) {
    return { ok: true, mock: true, orderId: id, message: 'Simulated cancel (mock order).' };
  }

  const apiKey = String(session.apiKey ?? '').trim().replace(/^\uFEFF/, '');
  const jwt = String(session.jwt ?? '').trim();
  if (!hasMstockSessionJwt(jwt, apiKey)) {
    return {
      ok: false,
      status: 401,
      message: 'Log in with mStock OTP to cancel live orders.',
    };
  }

  const variety = String(opts.variety ?? 'NORMAL').trim() || 'NORMAL';
  const path = `${PLACE_ORDER_PATH}/${encodeURIComponent(id)}`;
  const payload = { variety, orderid: id };
  const headers = {
    ...quoteHeaders(apiKey, jwt),
    'Content-Type': 'application/json',
  };

  try {
    const { statusCode, text } = await httpsJsonRequest('DELETE', path, payload, headers);
    const parsed = parseOrderResponse(text, statusCode);
    if (!parsed.ok) {
      return {
        ok: false,
        status: statusCode >= 400 ? statusCode : 400,
        message: parsed.message,
        errorcode: parsed.errorcode,
        orderId: id,
      };
    }
    return {
      ok: true,
      mock: false,
      orderId: parsed.orderId ?? id,
      message: parsed.message || 'Order cancelled',
    };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      message: e instanceof Error ? e.message : String(e),
      orderId: id,
    };
  }
}

/** @deprecated use placeOrder */
export async function placeOrderStub(body, session) {
  return placeOrder(body, session);
}
