import { useCallback, useEffect, useState } from 'react';
import type { SuggestFilters } from '../lib/filterSuggestedStocks';
import { normalizeStockSymbol } from '../lib/parseStockList';
import type { EquityAnalyzeResponse, WatchlistResponse } from '../types/equityStrategy';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export function useEquityWatchlist() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/equity/watchlist`);
      if (!res.ok) throw new Error(`Watchlist HTTP ${res.status}`);
      const data = (await res.json()) as WatchlistResponse;
      setSymbols(data.symbols ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addSymbol = useCallback(async (symbol: string) => {
    const res = await fetch(`${apiBase}/api/equity/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    if (!res.ok) throw new Error(`Add failed HTTP ${res.status}`);
    const data = await res.json();
    setSymbols(data.symbols ?? []);
    return data;
  }, []);

  const removeSymbol = useCallback(async (symbol: string) => {
    const res = await fetch(`${apiBase}/api/equity/watchlist/${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Remove failed HTTP ${res.status}`);
    const data = await res.json();
    setSymbols(data.symbols ?? []);
    return data;
  }, []);

  const importSymbols = useCallback(async (incoming: string[], mode: 'merge' | 'replace' = 'merge') => {
    const normalized = [...new Set(incoming.map(normalizeStockSymbol).filter(Boolean))];
    if (!normalized.length) throw new Error('No valid symbols in file');

    const current = mode === 'merge' ? symbols : [];
    const next = [...new Set([...current, ...normalized])];
    const added = normalized.filter((s) => !current.includes(s)).length;

    const res = await fetch(`${apiBase}/api/equity/watchlist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: next }),
    });
    if (!res.ok) throw new Error(`Import failed HTTP ${res.status}`);
    const data = await res.json();
    setSymbols(data.symbols ?? []);
    return { symbols: data.symbols as string[], added, skipped: normalized.length - added, total: next.length };
  }, [symbols]);

  return { symbols, loading, error, refresh, addSymbol, removeSymbol, importSymbols };
}

export function useEquityAnalysis(
  symbols: string[],
  pollMs = 30_000,
  suggestFilters?: SuggestFilters
) {
  const [data, setData] = useState<EquityAnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const s of symbols) {
        const sym = s.trim();
        if (sym) params.append('symbols', sym);
      }
      if (suggestFilters) {
        params.set('minConfidence', String(suggestFilters.minConfidence));
        params.set('minTargetPct', String(suggestFilters.minTargetPct));
      }
      const qs = params.toString();
      const res = await fetch(`${apiBase}/api/equity/analyze${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`Analyze HTTP ${res.status}`);
      const json = (await res.json()) as EquityAnalyzeResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [symbols, suggestFilters?.minConfidence, suggestFilters?.minTargetPct]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { data, loading, error, refresh };
}
