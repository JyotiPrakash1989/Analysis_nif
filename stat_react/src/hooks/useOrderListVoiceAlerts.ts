import { useRef } from 'react';
import type { OrderLogEntry } from '../types/niftyoptima';
import {
  equityOrderVoiceText,
  equityPositionExitAlertKey,
  markExitAlertSpoken,
  orderLogAlertKey,
  orderLogVoiceText,
  speakStrategyText,
  wasExitAlertSpoken,
} from '../lib/strategyVoice';

/** Voice for order log rows on the Orders page (NIFTY options + equity). */
export function useOrderListVoiceAlerts(voiceEnabled: boolean) {
  const lastKeyRef = useRef('');

  const announceOrderLog = (entry: OrderLogEntry) => {
    if (!voiceEnabled) return;

    const isEquity = entry.assetType === 'equity' || entry.optionType === 'EQ';
    const isClosingSell =
      entry.action === 'SELL' &&
      (entry.status === 'target_exit' ||
        entry.status === 'stoploss_exit' ||
        entry.status === 'closed');

    if (
      isEquity &&
      isClosingSell &&
      (entry.trigger === 'target' || entry.trigger === 'stoploss')
    ) {
      const parentId = String(entry.parentBuyId || entry.orderId || entry.id);
      const exitKey = equityPositionExitAlertKey(
        parentId,
        entry.trigger === 'stoploss' ? 'stoploss' : 'target'
      );
      if (wasExitAlertSpoken(exitKey)) return;
      markExitAlertSpoken(exitKey);
    }

    const text = isEquity
      ? equityOrderVoiceText({
          equitySymbol: entry.equitySymbol,
          action: entry.action,
          mode: entry.mode,
          trigger: entry.trigger,
          entry: entry.entry,
          sl: entry.sl,
          tgt: entry.tgt,
          exitPrice: entry.exitPrice,
          ltp: entry.ltp,
          status: entry.status,
          units: entry.units,
        })
      : orderLogVoiceText(entry);
    if (!text) return;

    const key = orderLogAlertKey(entry);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    speakStrategyText(text);
  };

  return { announceOrderLog };
}
