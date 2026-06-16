import { useEffect, useRef } from 'react';
import type { OptionChainRow, OrderRow } from '../types/niftyoptima';
import {
  markExitAlertSpoken,
  positionExitAlertKey,
  positionExitVoiceText,
  speakStrategyText,
  wasExitAlertSpoken,
} from '../lib/strategyVoice';

const OPEN_STATUSES = new Set(['open', 'submitted', 'simulated']);

function legLtp(row: OptionChainRow | undefined, side: 'CE' | 'PE'): number | null {
  if (!row) return null;
  const leg = side === 'CE' ? row.ce : row.pe;
  const ltp = Number(leg?.ltp);
  return Number.isFinite(ltp) ? ltp : null;
}

/** Voice when open position LTP hits target or stop-loss (auto & manual). */
export function usePositionExitVoice(
  voiceEnabled: boolean,
  orders: OrderRow[],
  chain: OptionChainRow[]
) {
  const announcedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!voiceEnabled || !orders.length) return;

    for (const o of orders) {
      if (o.action === 'SELL') continue;
      if (!OPEN_STATUSES.has(o.status)) continue;

      const sl = Number(o.sl);
      const tgt = Number(o.tgt);
      if (!Number.isFinite(sl) || !Number.isFinite(tgt)) continue;

      const row = chain.find((r) => r.strike === o.strike);
      const ltp = legLtp(row, o.side) ?? o.ltp;
      if (!Number.isFinite(ltp)) continue;

      if (ltp >= tgt) {
        const key = positionExitAlertKey(o.id, 'target');
        if (!announcedRef.current.has(key) && !wasExitAlertSpoken(key)) {
          announcedRef.current.add(key);
          markExitAlertSpoken(key);
          speakStrategyText(positionExitVoiceText(o.strike, o.side, 'target', ltp, tgt));
        }
      } else if (ltp <= sl) {
        const key = positionExitAlertKey(o.id, 'stoploss');
        if (!announcedRef.current.has(key) && !wasExitAlertSpoken(key)) {
          announcedRef.current.add(key);
          markExitAlertSpoken(key);
          speakStrategyText(positionExitVoiceText(o.strike, o.side, 'stoploss', ltp, sl));
        }
      }
    }
  }, [voiceEnabled, orders, chain]);
}
