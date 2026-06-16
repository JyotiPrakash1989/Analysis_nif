import { useCallback, useEffect, useState } from 'react';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

/** Poll live LTP for equity symbols (open order rows). */
export function useEquityOrderLtps(symbols: string[], pollMs = 5000) {
  const [ltpBySymbol, setLtpBySymbol] = useState<Map<string, number>>(new Map());

  const refresh = useCallback(async () => {
    const list = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
    if (!list.length) {
      setLtpBySymbol(new Map());
      return;
    }
    try {
      const qs = list.map((s) => `symbols=${encodeURIComponent(s)}`).join('&');
      const res = await fetch(`${apiBase}/api/equity/analyze?${qs}`);
      if (!res.ok) return;
      const json = (await res.json()) as { stocks?: Array<{ symbol: string; ltp: number }> };
      const next = new Map<string, number>();
      for (const stock of json.stocks ?? []) {
        const sym = String(stock.symbol).toUpperCase();
        const ltp = Number(stock.ltp);
        if (sym && Number.isFinite(ltp) && ltp > 0) next.set(sym, ltp);
      }
      setLtpBySymbol(next);
    } catch {
      /* keep prior */
    }
  }, [symbols]);

  useEffect(() => {
    void refresh();
    if (!symbols.length) return;
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [refresh, pollMs, symbols.length]);

  return ltpBySymbol;
}
