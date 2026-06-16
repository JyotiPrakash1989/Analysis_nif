export type EquityDayChange = {
  prevClose: number;
  points: number;
  percent: number;
};

export type EquityAnalysis = {
  side: 'BUY' | null;
  suggestPurchase: boolean;
  /** Intraday purchase price (current LTP when signal fires). */
  entry: number | null;
  sl: number | null;
  tgt: number | null;
  risk: number | null;
  reward: number | null;
  rr: number | null;
  confidence: number;
  score: number;
  rsi: number | null;
  ema9: number | null;
  ema21: number | null;
  vwap: number | null;
  prior15: {
    open: number;
    high: number;
    low: number;
    close: number;
  } | null;
  factors: string[];
  factorCount?: number;
  qualityGrade?: 'A' | 'B' | 'C' | null;
  liquidityOk?: boolean;
  relativeStrength?: number | null;
  sessionBlocked?: boolean;
  rationale: string;
};

export type EquityQuoteStats = {
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  prevClose: number;
  changePts: number;
  changePct: number;
  volume: number;
};

export type EquitySupportResistance = {
  support: number | null;
  resistance: number | null;
  pivot: number | null;
};

export type StockSnapshot = {
  symbol: string;
  name?: string;
  ltp: number;
  source: 'mstock' | 'public' | string;
  error: string;
  dayChange: EquityDayChange | null;
  quote: EquityQuoteStats | null;
  barsCount: number;
  analysis: EquityAnalysis;
  supportResistance: EquitySupportResistance | null;
  tradingsymbol?: string;
  scanSource?: 'watchlist' | 'nifty50';
};

export type RankedStock = StockSnapshot & {
  profitScore: number;
  rewardPct: number;
};

export type EquityDaySuggestionRow = {
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

export type EquityScanMeta = {
  universeSize: number;
  watchlistSize: number;
  nifty50Size: number;
  niftyChangePct: number | null;
  beforeOpeningRange: boolean;
};

export type EquityAnalyzeResponse = {
  stocks: StockSnapshot[];
  ranked: RankedStock[];
  topPick: RankedStock | null;
  analyzedAt: number;
  message?: string;
  scanMeta?: EquityScanMeta;
  /** All equity suggestions logged today (separate from NIFTY). */
  daySuggestions?: EquityDaySuggestionRow[];
};

export type WatchlistResponse = {
  symbols: string[];
};

export type EquitySignalPayload = {
  symbol: string;
  entry: number;
  sl: number;
  tgt: number;
  confidence: number;
  ltp?: number;
  rationale?: string;
  ts: number;
  autoTrading?: boolean;
};
