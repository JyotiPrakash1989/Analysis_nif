import { useCallback, useEffect, useState } from 'react';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export function useEquityTradingSettings() {
  const [autoTrading, setAutoTradingState] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/equity/trading/settings`);
      if (!res.ok) return;
      const data = await res.json();
      setAutoTradingState(data.autoTrading !== false);
    } catch {
      /* keep default */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setAutoTrading = useCallback(async (auto: boolean) => {
    setSyncing(true);
    try {
      const res = await fetch(`${apiBase}/api/equity/trading/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoTrading: auto }),
      });
      if (res.ok) {
        const data = await res.json();
        setAutoTradingState(Boolean(data.autoTrading));
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  return { autoTrading, setAutoTrading, syncing, refresh };
}
