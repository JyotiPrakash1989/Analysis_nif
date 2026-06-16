import { useEffect, useState } from 'react';
import type { MinuteBar } from '../types/niftyoptima';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export type NiftyHistoryRest = {
  bars: MinuteBar[];
  tradingDays: number;
  indexSource: 'mock' | 'mstock';
  indexError: string;
  polledAt: number;
};

export function useNiftyHistory(tradingDays = 5, restartKey = 0) {
  const [data, setData] = useState<NiftyHistoryRest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/api/nifty-history?days=${tradingDays}`);
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text();
          setData({
            bars: [],
            tradingDays,
            indexSource: 'mock',
            indexError: text.slice(0, 200) || `HTTP ${res.status}`,
            polledAt: 0,
          });
          return;
        }
        const j = (await res.json()) as NiftyHistoryRest;
        if (cancelled) return;
        setData(j);
      } catch {
        if (!cancelled) {
          setData({
            bars: [],
            tradingDays,
            indexSource: 'mock',
            indexError: 'Could not reach /api/nifty-history — is the server running (npm start)?',
            polledAt: 0,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tradingDays, restartKey]);

  return { data, loading };
}
