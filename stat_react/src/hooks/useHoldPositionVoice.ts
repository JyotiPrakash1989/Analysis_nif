import { useEffect, useRef } from 'react';
import type { HoldSuggestion } from '../types/niftyoptima';
import {
  holdForTargetVoiceText,
  holdSuggestionAlertKey,
  speakStrategyText,
} from '../lib/strategyVoice';

/** Voice-only hold hint when server suppresses a new signal due to an open position. */
export function useHoldPositionVoice(voiceEnabled: boolean, holdSuggestion: HoldSuggestion | null | undefined) {
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (!voiceEnabled || !holdSuggestion) return;
    const key = holdSuggestionAlertKey(holdSuggestion);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    speakStrategyText(holdForTargetVoiceText(holdSuggestion));
  }, [voiceEnabled, holdSuggestion]);
}
