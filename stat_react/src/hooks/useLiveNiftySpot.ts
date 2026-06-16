import { useEffect, useState } from 'react';
import type {
  FifteenBar,
  MinuteBar,
  NiftyDayChange,
  OptionChainRow,
  StrategyRuleLeg,
} from '../types/niftyoptima';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export type NiftySpotRest = {
  spot: number | null;
  dayChange?: NiftyDayChange | null;
  atm: number | null;
  optionChain: OptionChainRow[];
  optionChainExpiry?: string;
  chainSource?: 'mstock' | 'sim' | 'none';
  bars1m?: MinuteBar[];
  rsi?: number | null;
  prior15?: FifteenBar | null;
  current15?: FifteenBar | null;
  strategyRules?: {
    ce: StrategyRuleLeg | null;
    pe: StrategyRuleLeg | null;
  };
  indexSource: 'mock' | 'mstock' | 'pending' | 'public';
  indexError: string;
  indexFromLastCandle: boolean;
  polledAt: number;
  indexLive?: boolean;
  ipBlocked?: boolean;
  whitelistIp?: string | null;
};

export function useLiveNiftySpot(pollMs = 2000, restartKey = 0) {
  const [data, setData] = useState<NiftySpotRest | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/api/nifty-spot`);
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as NiftySpotRest;
        if (cancelled) return;
        setData(j);
      } catch {
        if (!cancelled) {
          setData((prev) =>
            prev ?? {
              spot: null,
              atm: null,
              optionChain: [],
              indexSource: 'mock',
              indexError: 'Could not reach /api/nifty-spot — is the server running (npm start)?',
              indexFromLastCandle: false,
              polledAt: 0,
            }
          );
        }
      }
    };
    poll();
    const id = window.setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollMs, restartKey]);

  return data;
}
