import { useEffect, useRef } from 'react';
import type { OrderLogEntry, SignalPayload } from '../types/niftyoptima';
import {
  markExitAlertSpoken,
  orderLogAlertKey,
  orderLogVoiceText,
  positionExitAlertKey,
  signalAlertKey,
  speakOrderLogEntry,
  speakStrategySignal,
  speakStrategyText,
  speakTradingMode,
  wasExitAlertSpoken,
} from '../lib/strategyVoice';

type Options = {
  signal: SignalPayload | null;
  voiceEnabled: boolean;
  autoTrading: boolean;
};

/** Voice for strategy signals and order events — works in auto and manual mode. */
export function useTradingVoiceAlerts({ signal, voiceEnabled, autoTrading }: Options) {
  const lastSignalKeyRef = useRef('');
  const lastOrderKeyRef = useRef('');
  const lastModeRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!voiceEnabled || !signal) return;
    const key = signalAlertKey(signal);
    if (key === lastSignalKeyRef.current) return;
    lastSignalKeyRef.current = key;
    speakStrategySignal(signal, autoTrading);
  }, [signal, voiceEnabled, autoTrading]);

  useEffect(() => {
    if (!voiceEnabled) return;
    if (lastModeRef.current === null) {
      lastModeRef.current = autoTrading;
      return;
    }
    if (lastModeRef.current === autoTrading) return;
    lastModeRef.current = autoTrading;
    speakTradingMode(autoTrading);
  }, [autoTrading, voiceEnabled]);

  const announceOrderLog = (entry: OrderLogEntry) => {
    if (!voiceEnabled) return;
    const text = orderLogVoiceText(entry);
    if (!text) return;

    const isClosingSell =
      entry.status === 'target_exit' ||
      entry.status === 'stoploss_exit' ||
      entry.status === 'closed';
    if (
      entry.action === 'SELL' &&
      isClosingSell &&
      (entry.trigger === 'target' || entry.trigger === 'stoploss')
    ) {
      const parentId = String(entry.parentBuyId || entry.orderId || entry.id);
      const exitKey = positionExitAlertKey(
        parentId,
        entry.trigger === 'stoploss' ? 'stoploss' : 'target'
      );
      if (wasExitAlertSpoken(exitKey)) return;
      markExitAlertSpoken(exitKey);
    }

    const key = orderLogAlertKey(entry);
    if (key === lastOrderKeyRef.current) return;
    lastOrderKeyRef.current = key;
    speakStrategyText(text);
  };

  return { announceOrderLog };
}
