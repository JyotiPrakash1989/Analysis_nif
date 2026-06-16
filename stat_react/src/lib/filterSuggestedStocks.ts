import type { EquitySignalPayload, RankedStock, StockSnapshot } from '../types/equityStrategy';

export type SuggestFilters = {
  minConfidence: number;
  minTargetPct: number;
};

export const DEFAULT_SUGGEST_FILTERS: SuggestFilters = {
  minConfidence: 82,
  minTargetPct: 3.5,
};

function gradeBoost(grade: string | null | undefined): number {
  if (grade === 'A') return 1.15;
  if (grade === 'B') return 1.08;
  return 1;
}

export function computeProfitScore(stock: StockSnapshot): number {
  const a = stock.analysis;
  if (!a?.entry || !a?.tgt) return 0;
  const rewardPct = ((a.tgt - a.entry) / a.entry) * 100;
  const confidence = a.confidence ?? 0;
  const rr = a.rr ?? 2;
  const rrBoost = rr >= 2 ? 1.1 : 1;
  const rsBoost =
    a.relativeStrength != null && a.relativeStrength >= 0.5 ? 1.06 : 1;
  const raw = confidence * (1 + rewardPct / 8) * gradeBoost(a.qualityGrade) * rrBoost * rsBoost;
  return Math.round(raw * 100) / 100;
}

/** Max ranked suggestions shown — matches server-side quality filter. */
export const MAX_RANKED_SUGGESTIONS = 2;
export const MIN_PROFIT_SCORE = 90;

export function stockTargetMovePct(stock: StockSnapshot): number | null {
  const entry = Number(stock.analysis?.entry);
  const tgt = Number(stock.analysis?.tgt);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(tgt)) return null;
  return ((tgt - entry) / entry) * 100;
}

export function signalMeetsSuggestFilters(
  signal: EquitySignalPayload,
  filters: SuggestFilters
): boolean {
  const entry = Number(signal.entry);
  const tgt = Number(signal.tgt);
  const confidence = Number(signal.confidence);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(tgt)) return false;
  const targetPct = ((tgt - entry) / entry) * 100;
  return confidence >= filters.minConfidence && targetPct >= filters.minTargetPct;
}

export function meetsSuggestFilters(stock: StockSnapshot, filters: SuggestFilters): boolean {
  const a = stock.analysis;
  if (!a?.suggestPurchase || a.side !== 'BUY' || stock.ltp <= 0) return false;
  const targetPct = stockTargetMovePct(stock);
  if ((a.confidence ?? 0) < filters.minConfidence) return false;
  if (targetPct == null || targetPct < filters.minTargetPct) return false;
  return true;
}

export function rankSuggestedStocks(
  stocks: StockSnapshot[],
  filters: SuggestFilters
): RankedStock[] {
  return stocks
    .filter((s) => meetsSuggestFilters(s, filters))
    .map((s) => {
      const rewardPct = stockTargetMovePct(s) ?? 0;
      const profitScore = computeProfitScore(s);
      return {
        ...s,
        profitScore,
        rewardPct: Math.round(rewardPct * 100) / 100,
      };
    })
    .filter((s) => s.profitScore >= MIN_PROFIT_SCORE)
    .sort((a, b) => b.profitScore - a.profitScore)
    .slice(0, MAX_RANKED_SUGGESTIONS);
}

export function clampSuggestFilters(filters: Partial<SuggestFilters>): SuggestFilters {
  const minConfidence = Math.min(
    100,
    Math.max(0, Math.round(Number(filters.minConfidence) || DEFAULT_SUGGEST_FILTERS.minConfidence))
  );
  const minTargetPct = Math.min(
    50,
    Math.max(0.5, Number(filters.minTargetPct) || DEFAULT_SUGGEST_FILTERS.minTargetPct)
  );
  return { minConfidence, minTargetPct };
}
