import { useCallback, useEffect, useState } from 'react';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export type NiftyDaySuggestion = {
  id: string;
  ts: number;
  dayKey: string;
  assetType: 'nifty';
  status?: 'active' | 'suppressed' | string;
  side: 'CE' | 'PE';
  optionType: 'CE' | 'PE';
  strike: number;
  entry: number;
  sl: number;
  tgt: number;
  risk?: number;
  confidence?: number | null;
  signalIndex?: number | null;
  rationale?: string;
};

export type EquityDaySuggestion = {
  id: string;
  ts: number;
  dayKey: string;
  assetType: 'equity';
  symbol: string;
  entry: number;
  sl: number;
  tgt: number;
  confidence: number;
  ltp?: number;
  rationale?: string;
};

export function useDaySuggestions(asset: 'nifty' | 'equity', pollMs = 8000, day?: string) {
  const [suggestions, setSuggestions] = useState<(NiftyDaySuggestion | EquityDaySuggestion)[]>([]);
  const [sessionDay, setSessionDay] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const q = day ? `?day=${encodeURIComponent(day)}` : '';
      const res = await fetch(`${apiBase}/api/suggestions/${asset}${q}`);
      if (!res.ok) return;
      const j = (await res.json()) as {
        day?: string;
        suggestions?: (NiftyDaySuggestion | EquityDaySuggestion)[];
      };
      setSessionDay(j.day ?? '');
      setSuggestions(Array.isArray(j.suggestions) ? j.suggestions : []);
    } catch {
      /* keep prior */
    } finally {
      setLoading(false);
    }
  }, [asset, day]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, pollMs);
    return () => window.clearInterval(id);
  }, [refresh, pollMs]);

  return { suggestions, sessionDay, loading, refresh };
}
