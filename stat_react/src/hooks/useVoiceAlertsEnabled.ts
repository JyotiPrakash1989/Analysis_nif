import { useEffect, useState } from 'react';
import { readVoiceAlertsEnabled } from '../lib/strategyVoice';

/** Shared voice toggle — stays in sync across tabs and Nifty / Stocks pages. */
export function useVoiceAlertsEnabled() {
  const [enabled, setEnabled] = useState(readVoiceAlertsEnabled);

  useEffect(() => {
    const sync = () => setEnabled(readVoiceAlertsEnabled());
    window.addEventListener('niftyoptima-voice-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('niftyoptima-voice-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return enabled;
}
