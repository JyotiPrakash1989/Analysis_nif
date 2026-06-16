/**
 * Order log rows for equity target / stop-loss exits after a buy fill.
 */

/** @param {object} params */
export function buildEquityExitLogRows({
  dayKey,
  symbol,
  buy,
  out,
  mode,
  entry,
  sl,
  tgt,
}) {
  const rows = [];
  const buyId = buy.orderId;

  if (buy.ok && out.targetSell?.ok) {
    const ts = out.targetSell;
    rows.push({
      dayKey,
      ts: Date.now(),
      assetType: 'equity',
      equitySymbol: symbol,
      action: 'SELL',
      mode,
      trigger: 'target',
      parentBuyId: buyId,
      optionType: 'EQ',
      strike: 0,
      lots: 1,
      units: buy.units ?? buy.quantity ?? 1,
      entry,
      sl,
      tgt,
      exitPrice: tgt,
      orderId: ts.orderId,
      mock: ts.mock,
      status: ts.mock ? 'target_pending' : 'submitted',
      message: ts.ok
        ? `Target sell LIMIT @ ${Number(tgt).toFixed(2)}`
        : ts.message || 'Target sell failed',
      tradingsymbol: ts.tradingsymbol ?? buy.tradingsymbol,
      exchange: ts.exchange ?? buy.exchange,
    });
  }

  if (buy.ok && out.stopLossSell?.ok) {
    const slOrder = out.stopLossSell;
    rows.push({
      dayKey,
      ts: Date.now(),
      assetType: 'equity',
      equitySymbol: symbol,
      action: 'SELL',
      mode,
      trigger: 'stoploss',
      parentBuyId: buyId,
      optionType: 'EQ',
      strike: 0,
      lots: 1,
      units: buy.units ?? buy.quantity ?? 1,
      entry,
      sl,
      tgt,
      exitPrice: sl,
      orderId: slOrder.orderId,
      mock: slOrder.mock,
      status: slOrder.mock ? 'stoploss_pending' : 'submitted',
      message: slOrder.ok
        ? `Stop-loss sell @ ${Number(sl).toFixed(2)}`
        : slOrder.message || 'Stop-loss sell failed',
      tradingsymbol: slOrder.tradingsymbol ?? buy.tradingsymbol,
      exchange: slOrder.exchange ?? buy.exchange,
    });
  }

  return rows;
}
