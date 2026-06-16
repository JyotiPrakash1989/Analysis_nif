import { useEffect, useRef } from 'react';
import type { StockSnapshot } from '../types/equityStrategy';
import {
  equityPositionExitAlertKey,
  equityPositionExitVoiceText,
  markExitAlertSpoken,
  speakStrategyText,
  wasExitAlertSpoken,
} from '../lib/strategyVoice';

const OPEN_STATUSES = new Set(['open', 'submitted', 'simulated']);

type OpenOrder = {
  id: string;
  symbol: string;
  entry: number;
  sl: number;
  tgt: number;
  status: string;
};

/** Voice when equity LTP hits target or stop-loss on an open position. */
export function useEquityPositionExitVoice(
  voiceEnabled: boolean,
  openOrders: OpenOrder[],
  stocks: StockSnapshot[]
) {
  const announcedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!voiceEnabled || !openOrders.length) return;

    const ltpBySymbol = new Map(
      stocks.map((s) => [s.symbol.toUpperCase(), Number(s.ltp)] as const)
    );

    for (const order of openOrders) {
      if (!OPEN_STATUSES.has(order.status)) continue;
      const sl = Number(order.sl);
      const tgt = Number(order.tgt);
      const ltp = ltpBySymbol.get(order.symbol.toUpperCase());
      if (!Number.isFinite(ltp) || ltp <= 0) continue;

      if (Number.isFinite(tgt) && tgt > 0 && ltp >= tgt) {
        const key = equityPositionExitAlertKey(order.id, 'target');
        if (announcedRef.current.has(key) || wasExitAlertSpoken(key)) continue;
        announcedRef.current.add(key);
        markExitAlertSpoken(key);
        speakStrategyText(equityPositionExitVoiceText(order.symbol, 'target', ltp, tgt));
      } else if (Number.isFinite(sl) && sl > 0 && ltp <= sl) {
        const key = equityPositionExitAlertKey(order.id, 'stoploss');
        if (announcedRef.current.has(key) || wasExitAlertSpoken(key)) continue;
        announcedRef.current.add(key);
        markExitAlertSpoken(key);
        speakStrategyText(equityPositionExitVoiceText(order.symbol, 'stoploss', ltp, sl));
      }
    }
  }, [voiceEnabled, openOrders, stocks]);
}
