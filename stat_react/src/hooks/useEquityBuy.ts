import { useCallback, useState } from 'react';
import { pushOrderLogEntries } from '../lib/orderLogBus';
import type { StockSnapshot } from '../types/equityStrategy';
import type { OrderLogEntry } from '../types/niftyoptima';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export type BuyLevels = {
  entry: number;
  sl: number;
  tgt: number;
};

/** Buy levels only when strategy marks a purchase suggestion (confidence + target settings met). */
export function buyLevelsForStock(stock: StockSnapshot): BuyLevels | null {
  if (!stock.ltp || stock.ltp <= 0) return null;
  const a = stock.analysis;
  if (!a?.suggestPurchase || a.side !== 'BUY') return null;
  if (a.entry == null || a.sl == null || a.tgt == null) return null;
  return { entry: stock.ltp, sl: a.sl, tgt: a.tgt };
}

export function useEquityBuy() {
  const [buyingSymbol, setBuyingSymbol] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ symbol: string; ok: boolean; message: string } | null>(
    null
  );

  const buyNow = useCallback(async (stock: StockSnapshot, quantity = 1) => {
    const levels = buyLevelsForStock(stock);
    if (!levels) {
      setLastResult({ symbol: stock.symbol, ok: false, message: 'No price available' });
      return null;
    }
    setBuyingSymbol(stock.symbol);
    setLastResult(null);
    try {
      const res = await fetch(`${apiBase}/api/equity/place-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: stock.symbol,
          quantity,
          entry: levels.entry,
          sl: levels.sl,
          tgt: levels.tgt,
        }),
      });
      const data = await res.json();
      let msg = data.message || data.order?.message || (data.ok ? 'Buy placed' : 'Order failed');
      if (data.ok) {
        const parts = ['Buy placed'];
        if (data.targetSellOk) parts.push(`target @ ${levels.tgt.toFixed(2)}`);
        if (data.stopLossSellOk) parts.push(`stop-loss @ ${levels.sl.toFixed(2)}`);
        else if (data.ok && !data.stopLossSellOk && !data.targetSellOk) {
          parts.push('exit orders pending or failed — check broker');
        }
        msg = parts.join(' · ');
      }
      setLastResult({ symbol: stock.symbol, ok: Boolean(data.ok), message: msg });
      if (data.ok) {
        const rows: OrderLogEntry[] = [];
        if (data.log) rows.push(data.log as OrderLogEntry);
        if (Array.isArray(data.exitLogs)) rows.push(...(data.exitLogs as OrderLogEntry[]));
        if (rows.length) pushOrderLogEntries(rows);
      }
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastResult({ symbol: stock.symbol, ok: false, message: msg });
      return null;
    } finally {
      setBuyingSymbol(null);
    }
  }, []);

  return { buyNow, buyingSymbol, lastResult, clearResult: () => setLastResult(null) };
}
