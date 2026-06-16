import { useEffect, useState } from 'react';
import type { OptionChainRow } from '../types/niftyoptima';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export type OptionChainRest = {
  spot: number | null;
  atm: number | null;
  optionChain: OptionChainRow[];
  optionChainExpiry: string | null;
  chainSource?: 'mstock' | 'sim' | 'none';
  chainIpBlocked?: boolean;
  chainNote?: string;
};

export function useOptionChainForSpot(spot: number | null, pollMs = 2500, restartKey = 0) {
  const [data, setData] = useState<OptionChainRest | null>(null);
  const intervalMs = data?.chainIpBlocked ? 120_000 : pollMs;

  useEffect(() => {
    if (spot == null || !Number.isFinite(spot)) {
      setData(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `${apiBase}/api/option-chain?spot=${encodeURIComponent(String(spot))}`
        );
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as OptionChainRest;
        if (!cancelled) setData(j);
      } catch {
        /* keep last good chain */
      }
    };
    load();
    const id = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [spot, intervalMs, restartKey]);

  return data;
}
