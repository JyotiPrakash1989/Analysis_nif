import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_MIN_DAILY_SCORE,
  readAutoTradingLocal,
  readMinDailyScoreLocal,
  writeAutoTradingLocal,
  writeMinDailyScoreLocal,
} from '../lib/tradingMode';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export function useTradingSettings() {
  const [autoTrading, setAutoTrading] = useState(readAutoTradingLocal);
  const [minDailyScore, setMinDailyScore] = useState(readMinDailyScoreLocal);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/trading/settings`);
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { autoTrading?: boolean; minDailyScore?: number };
        if (cancelled) return;
        if (typeof j.autoTrading === 'boolean') {
          setAutoTrading(j.autoTrading);
          writeAutoTradingLocal(j.autoTrading);
        }
        if (typeof j.minDailyScore === 'number' && Number.isFinite(j.minDailyScore)) {
          setMinDailyScore(j.minDailyScore);
          writeMinDailyScoreLocal(j.minDailyScore);
        }
      } catch {
        /* keep local default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback(async (enabled: boolean) => {
    setSyncing(true);
    setAutoTrading(enabled);
    writeAutoTradingLocal(enabled);
    try {
      await fetch(`${apiBase}/api/trading/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoTrading: enabled }),
      });
    } catch {
      /* UI still updated locally */
    } finally {
      setSyncing(false);
    }
  }, []);

  const scoreSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setScore = useCallback((score: number) => {
    const clamped = Math.min(100, Math.max(50, Math.round(score)));
    setMinDailyScore(clamped);
    writeMinDailyScoreLocal(clamped);
    if (scoreSyncTimer.current) clearTimeout(scoreSyncTimer.current);
    scoreSyncTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        await fetch(`${apiBase}/api/trading/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minDailyScore: clamped }),
        });
      } catch {
        /* UI still updated locally */
      } finally {
        setSyncing(false);
      }
    }, 400);
  }, []);

  return {
    autoTrading,
    setAutoTrading: setMode,
    minDailyScore,
    setMinDailyScore: setScore,
    defaultMinDailyScore: DEFAULT_MIN_DAILY_SCORE,
    syncing,
  };
}
