import type { EquityAnalysis, StockSnapshot } from '../types/equityStrategy';

const emptyAnalysis = (): EquityAnalysis => ({
  side: null,
  suggestPurchase: false,
  entry: null,
  sl: null,
  tgt: null,
  risk: null,
  reward: null,
  rr: null,
  confidence: 0,
  score: 0,
  rsi: null,
  ema9: null,
  ema21: null,
  vwap: null,
  prior15: null,
  factors: [],
  rationale: 'Loading quote…',
});

export function dayChangePercent(stock: StockSnapshot): number | null {
  if (stock.dayChange?.percent != null && Number.isFinite(stock.dayChange.percent)) {
    return stock.dayChange.percent;
  }
  if (stock.quote?.changePct != null && Number.isFinite(stock.quote.changePct)) {
    return stock.quote.changePct;
  }
  return null;
}

/** Positive % change on top, negative on bottom (highest to lowest). */
export function sortStocksByDayChange(stocks: StockSnapshot[]): StockSnapshot[] {
  return [...stocks].sort((a, b) => {
    const pa = dayChangePercent(a);
    const pb = dayChangePercent(b);
    if (pa == null && pb == null) return a.symbol.localeCompare(b.symbol);
    if (pa == null) return 1;
    if (pb == null) return -1;
    if (pb !== pa) return pb - pa;
    return a.symbol.localeCompare(b.symbol);
  });
}

/** Merge attached symbols with quote data, then sort by day % change. */
export function mergeWatchlistStocks(symbols: string[], stocks: StockSnapshot[]): StockSnapshot[] {
  const bySymbol = new Map(stocks.map((s) => [s.symbol.toUpperCase(), s]));
  const merged = symbols.map((sym) => {
    const key = sym.toUpperCase();
    const existing = bySymbol.get(key);
    if (existing) return existing;
    return {
      symbol: key,
      name: key,
      ltp: 0,
      source: 'pending',
      error: '',
      dayChange: null,
      quote: null,
      barsCount: 0,
      analysis: emptyAnalysis(),
      supportResistance: null,
    };
  });
  return sortStocksByDayChange(merged);
}
