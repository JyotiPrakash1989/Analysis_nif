import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  NiftyAlphaState,
  Outlook,
  PurchaseStrategy,
  StrikeSuggestion,
} from '../types';
import { getLiveNiftyLtp } from '../services/mstockApi';

const initialState: NiftyAlphaState = {
  niftySpot: 24500,
  liveNiftyLtp: null,
  liveNiftyLoading: true,
  liveNiftyError: '',
  liveNiftyFromLastCandle: false,
  outlook: 'bullish',
  strikeSuggestion: {
    outlook: 'bullish',
    suggestedStrike: 24600,
    reason: 'ATM+100 CE for bullish momentum; delta ~0.5.',
    deltaHint: 'Δ ~0.5',
    optionType: 'CE',
  },
  analytics: {
    pcr: 0.95,
    pcrZone: 'neutral',
    maxPainStrike: 24400,
    oiHighlights: [
      { strike: 25500, optionType: 'CE', oiChangePercent: 200, label: 'Possible breakout' },
      { strike: 24400, optionType: 'PE', oiChangePercent: 45, label: 'Support build-up' },
    ],
  },
  purchaseStrategy: {
    entryPrice: 125.5,
    stopLoss: 98,
    bookProfit: 165,
    strikePrice: 24600,
    optionType: 'CE',
    reason: 'Backtest EMA+RSI oversold bounce.',
  },
  strategyLoading: false,
  strategyError: '',
  hasPosition: false,
  entryPrice: null,
  currentPrice: null,
  trailingSlActive: false,
  profitPercent: null,
};

type NiftyAlphaActions = {
  loadLiveNifty: () => void;
  loadPurchaseStrategy: () => void;
  refresh: () => void;
  setOutlook: (o: Outlook) => void;
  buy: () => void;
  exitAll: () => void;
  simulatePriceMove: (price: number) => void;
};

const NiftyAlphaContext = createContext<{
  state: NiftyAlphaState;
  actions: NiftyAlphaActions;
} | null>(null);

export function NiftyAlphaProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NiftyAlphaState>(initialState);

  const loadLiveNifty = useCallback(async () => {
    setState((s) => ({ ...s, liveNiftyLoading: true, liveNiftyError: '' }));
    const result = await getLiveNiftyLtp();
    setState((s) => ({
      ...s,
      liveNiftyLtp: result.ltp,
      liveNiftyLoading: false,
      liveNiftyError: result.error,
      liveNiftyFromLastCandle: result.fromLastCandle,
    }));
  }, []);

  useEffect(() => {
    loadLiveNifty();
  }, [loadLiveNifty]);

  const loadPurchaseStrategy = useCallback(() => {
    setState((s) => ({ ...s, strategyLoading: true, strategyError: '' }));
    setTimeout(() => {
      setState((s) => ({
        ...s,
        purchaseStrategy: s.purchaseStrategy
          ? { ...s.purchaseStrategy, entryPrice: s.purchaseStrategy.entryPrice + 2 }
          : (initialState.purchaseStrategy as PurchaseStrategy),
        strategyLoading: false,
      }));
    }, 600);
  }, []);

  const refresh = useCallback(() => {
    loadLiveNifty();
    loadPurchaseStrategy();
  }, [loadLiveNifty, loadPurchaseStrategy]);

  const setOutlook = useCallback((outlook: Outlook) => {
    const suggestions: Record<Outlook, StrikeSuggestion> = {
      bullish: {
        outlook: 'bullish',
        suggestedStrike: 24600,
        reason: 'ATM+100 CE for bullish momentum; delta ~0.5.',
        deltaHint: 'Δ ~0.5',
        optionType: 'CE',
      },
      bearish: {
        outlook: 'bearish',
        suggestedStrike: 24400,
        reason: 'ATM-100 PE for bearish view; delta ~-0.5.',
        deltaHint: 'Δ ~-0.5',
        optionType: 'PE',
      },
      neutral: {
        outlook: 'neutral',
        suggestedStrike: 24500,
        reason: 'ATM straddle or strangle for range.',
        deltaHint: 'Δ ~0',
        optionType: 'CE',
      },
      scalping: {
        outlook: 'scalping',
        suggestedStrike: 24550,
        reason: 'Near ATM for quick scalps.',
        deltaHint: 'Δ ~0.4',
        optionType: 'CE',
      },
    };
    setState((s) => ({ ...s, outlook, strikeSuggestion: suggestions[outlook] }));
  }, []);

  const buy = useCallback(() => {
    setState((s) => {
      if (s.hasPosition) return s;
      const entry = s.purchaseStrategy?.entryPrice ?? 120;
      return {
        ...s,
        hasPosition: true,
        entryPrice: entry,
        currentPrice: entry,
        profitPercent: 0,
      };
    });
  }, []);

  const exitAll = useCallback(() => {
    setState((s) => ({
      ...s,
      hasPosition: false,
      entryPrice: null,
      currentPrice: null,
      trailingSlActive: false,
      profitPercent: null,
    }));
  }, []);

  const simulatePriceMove = useCallback((price: number) => {
    setState((s) => {
      if (!s.hasPosition || s.entryPrice == null) return s;
      const profitPercent = ((price - s.entryPrice) / s.entryPrice) * 100;
      const trailingSlActive = profitPercent >= 10;
      return {
        ...s,
        currentPrice: price,
        profitPercent,
        trailingSlActive: trailingSlActive || s.trailingSlActive,
      };
    });
  }, []);

  const actions: NiftyAlphaActions = useMemo(
    () => ({
      loadLiveNifty,
      loadPurchaseStrategy,
      refresh,
      setOutlook,
      buy,
      exitAll,
      simulatePriceMove,
    }),
    [loadLiveNifty, loadPurchaseStrategy, refresh, setOutlook, buy, exitAll, simulatePriceMove]
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return (
    <NiftyAlphaContext.Provider value={value}>
      {children}
    </NiftyAlphaContext.Provider>
  );
}

export function useNiftyAlpha() {
  const ctx = useContext(NiftyAlphaContext);
  if (!ctx) throw new Error('useNiftyAlpha must be used within NiftyAlphaProvider');
  return ctx;
}
