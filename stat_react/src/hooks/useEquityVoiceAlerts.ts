import { useEffect, useRef } from 'react';
import { signalMeetsSuggestFilters, type SuggestFilters } from '../lib/filterSuggestedStocks';
import type { EquitySignalPayload } from '../types/equityStrategy';
import {
  equityPositionExitAlertKey,
  markExitAlertSpoken,
  speakEquityOrderLog,
  speakEquitySignal,
  wasExitAlertSpoken,
} from '../lib/strategyVoice';
import type { EquityOrderLogEntry } from './useEquitySocket';

type Options = {
  signal: EquitySignalPayload | null;
  voiceEnabled: boolean;
  autoTrading: boolean;
  filters?: SuggestFilters;
};

export function useEquityVoiceAlerts({ signal, voiceEnabled, autoTrading, filters }: Options) {
  const lastOrderKeyRef = useRef('');

  useEffect(() => {
    if (!voiceEnabled || !signal) return;
    if (filters && !signalMeetsSuggestFilters(signal, filters)) return;
    speakEquitySignal(
      {
        ...signal,
        autoTrading,
        minConfidence: filters?.minConfidence,
        minTargetPct: filters?.minTargetPct,
      },
      false
    );
  }, [signal, voiceEnabled, autoTrading, filters?.minConfidence, filters?.minTargetPct]);

  const announceOrderLog = (entry: EquityOrderLogEntry) => {
    if (!voiceEnabled) return;

    const isClosingSell =
      entry.action === 'SELL' &&
      (entry.status === 'target_exit' ||
        entry.status === 'stoploss_exit' ||
        entry.status === 'closed');
    if (
      isClosingSell &&
      (entry.trigger === 'target' || entry.trigger === 'stoploss')
    ) {
      const parentId = String(entry.parentBuyId || entry.orderId || entry.ts);
      const exitKey = equityPositionExitAlertKey(
        parentId,
        entry.trigger === 'stoploss' ? 'stoploss' : 'target'
      );
      if (wasExitAlertSpoken(exitKey)) return;
      markExitAlertSpoken(exitKey);
    }

    const key = `${entry.action}-${entry.trigger || 'na'}-${entry.orderId || entry.ts}`;
    if (key === lastOrderKeyRef.current) return;
    lastOrderKeyRef.current = key;
    speakEquityOrderLog(entry);
  };

  return { announceOrderLog };
}
