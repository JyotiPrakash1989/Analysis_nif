/** User's market outlook for Smart Strike suggestion */
export type Outlook = 'bullish' | 'bearish' | 'neutral' | 'scalping';

export const OUTLOOK_LABELS: Record<Outlook, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  neutral: 'Neutral',
  scalping: 'Scalping',
};

/** Strategy for purchasing Nifty option */
export interface PurchaseStrategy {
  entryPrice: number;
  stopLoss: number;
  bookProfit: number;
  strikePrice: number;
  optionType: string;
  niftyLevelAtEntry?: number;
  expiryDate?: string;
  reason?: string;
}

export function strikeLabel(s: PurchaseStrategy): string {
  return `${s.strikePrice} ${s.optionType}`;
}

/** Suggested strike from Smart Strike Selector */
export interface StrikeSuggestion {
  outlook: Outlook;
  suggestedStrike: number;
  reason: string;
  deltaHint: string;
  optionType?: string;
}

/** PCR zone */
export type PcrZone = 'overbought' | 'oversold' | 'neutral';

export const PCR_ZONE_LABELS: Record<PcrZone, string> = {
  overbought: 'Overbought',
  oversold: 'Oversold',
  neutral: 'Neutral',
};

export interface OiHighlight {
  strike: number;
  optionType: string;
  oiChangePercent: number;
  label: string;
}

export interface AnalyticsSnapshot {
  pcr: number;
  pcrZone: PcrZone;
  maxPainStrike: number;
  oiHighlights: OiHighlight[];
}

/** Full Nifty Alpha UI state */
export interface NiftyAlphaState {
  niftySpot: number;
  liveNiftyLtp: number | null;
  liveNiftyLoading: boolean;
  liveNiftyError: string;
  liveNiftyFromLastCandle: boolean;
  outlook: Outlook;
  strikeSuggestion: StrikeSuggestion | null;
  analytics: AnalyticsSnapshot | null;
  purchaseStrategy: PurchaseStrategy | null;
  strategyLoading: boolean;
  strategyError: string;
  hasPosition: boolean;
  entryPrice: number | null;
  currentPrice: number | null;
  trailingSlActive: boolean;
  profitPercent: number | null;
}
