import { useEffect, useRef } from 'react';
import { meetsSuggestFilters, type SuggestFilters } from '../lib/filterSuggestedStocks';
import { speakEquitySignal } from '../lib/strategyVoice';
import type { RankedStock } from '../types/equityStrategy';

/**
 * Voice when a stock newly appears on the suggested list (meets header filter settings).
 */
export function useEquitySuggestVoice(
  ranked: RankedStock[],
  voiceEnabled: boolean,
  autoTrading: boolean,
  filters: SuggestFilters
) {
  const prevSymbolsRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!voiceEnabled) return;

    const prev = prevSymbolsRef.current;
    const current = new Set(ranked.map((s) => s.symbol));

    if (!seededRef.current) {
      seededRef.current = true;
      prevSymbolsRef.current = current;
      return;
    }

    for (const stock of ranked) {
      if (prev.has(stock.symbol)) continue;
      if (!meetsSuggestFilters(stock, filters)) continue;
      const a = stock.analysis;
      speakEquitySignal(
        {
          symbol: stock.symbol,
          entry: a.entry ?? 0,
          sl: a.sl ?? 0,
          tgt: a.tgt ?? 0,
          confidence: a.confidence,
          rewardPct: stock.rewardPct,
          minConfidence: filters.minConfidence,
          minTargetPct: filters.minTargetPct,
          ts: Date.now(),
          autoTrading,
        },
        false
      );
    }

    prevSymbolsRef.current = current;
  }, [ranked, voiceEnabled, autoTrading, filters.minConfidence, filters.minTargetPct]);
}
