import { useEffect, useState } from 'react';

export type EquitySymbolSuggestion = {
  symbol: string;
  name: string;
};

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export function useEquitySymbolSearch(query: string, debounceMs = 250) {
  const [suggestions, setSuggestions] = useState<EquitySymbolSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const id = setTimeout(() => {
      setLoading(true);
      void fetch(`${apiBase}/api/equity/symbols/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : { suggestions: [] }))
        .then((data) => setSuggestions(data.suggestions ?? []))
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, debounceMs);

    return () => clearTimeout(id);
  }, [query, debounceMs]);

  return { suggestions, loading };
}
