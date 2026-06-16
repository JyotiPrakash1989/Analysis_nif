import { useCallback, useEffect, useState } from 'react';
import {
  clampSuggestFilters,
  DEFAULT_SUGGEST_FILTERS,
  type SuggestFilters,
} from '../lib/filterSuggestedStocks';

const STORAGE_KEY = 'equity-suggest-filters';
const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

function readStoredFilters(): SuggestFilters {
  if (typeof window === 'undefined') return DEFAULT_SUGGEST_FILTERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SUGGEST_FILTERS;
    return clampSuggestFilters(JSON.parse(raw) as Partial<SuggestFilters>);
  } catch {
    return DEFAULT_SUGGEST_FILTERS;
  }
}

function writeStoredFilters(filters: SuggestFilters) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
}

export function useEquitySuggestSettings() {
  const [filters, setFiltersState] = useState<SuggestFilters>(readStoredFilters);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/equity/trading/settings`);
      if (!res.ok) return;
      const data = await res.json();
      const next = clampSuggestFilters({
        minConfidence: data.minConfidence,
        minTargetPct: data.minTargetPct,
      });
      setFiltersState(next);
      writeStoredFilters(next);
    } catch {
      /* keep local */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setSuggestFilters = useCallback(async (patch: Partial<SuggestFilters>) => {
    const next = clampSuggestFilters({ ...filters, ...patch });
    setFiltersState(next);
    writeStoredFilters(next);
    setSyncing(true);
    try {
      const res = await fetch(`${apiBase}/api/equity/trading/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const data = await res.json();
        const synced = clampSuggestFilters({
          minConfidence: data.minConfidence,
          minTargetPct: data.minTargetPct,
        });
        setFiltersState(synced);
        writeStoredFilters(synced);
      }
    } finally {
      setSyncing(false);
    }
  }, [filters]);

  return { filters, setSuggestFilters, syncing, refresh };
}
