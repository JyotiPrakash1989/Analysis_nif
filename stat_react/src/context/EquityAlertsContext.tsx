import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useEquityAnalysis, useEquityWatchlist } from '../hooks/useEquityAnalysis';
import { useEquityPositionExitVoice } from '../hooks/useEquityPositionExitVoice';
import { useEquitySocket } from '../hooks/useEquitySocket';
import { useEquitySuggestSettings } from '../hooks/useEquitySuggestSettings';
import { useEquitySuggestVoice } from '../hooks/useEquitySuggestVoice';
import { useEquityTradingSettings } from '../hooks/useEquityTradingSettings';
import { useEquityVoiceAlerts } from '../hooks/useEquityVoiceAlerts';
import { useSharedOrderLog } from './OrderLogContext';
import { useVoiceAlertsEnabled } from '../hooks/useVoiceAlertsEnabled';
import { rankSuggestedStocks } from '../lib/filterSuggestedStocks';
import { filterEquityOrderLogs, isEquityOrder } from '../lib/orderAsset';
import type { EquityAnalyzeResponse, RankedStock } from '../types/equityStrategy';
import { buildExitByBuyId, outcomeFromLog, type OrderLogEntry } from '../types/niftyoptima';

export type EquityProfitableHint = {
  symbol: string;
  confidence: number;
  rewardPct: number;
  profitScore: number;
};

type EquityAlertsContextValue = {
  connected: boolean;
  symbols: string[];
  watchlistLoading: boolean;
  watchlistError: string | null;
  addSymbol: ReturnType<typeof useEquityWatchlist>['addSymbol'];
  removeSymbol: ReturnType<typeof useEquityWatchlist>['removeSymbol'];
  importSymbols: ReturnType<typeof useEquityWatchlist>['importSymbols'];
  refreshWatchlist: ReturnType<typeof useEquityWatchlist>['refresh'];
  data: EquityAnalyzeResponse | null;
  analysisLoading: boolean;
  analysisError: string | null;
  refreshAnalysis: ReturnType<typeof useEquityAnalysis>['refresh'];
  ranked: RankedStock[];
  topPick: RankedStock | null;
  profitableHint: EquityProfitableHint | null;
};

const EquityAlertsContext = createContext<EquityAlertsContextValue | null>(null);

export function useEquityAlerts() {
  const ctx = useContext(EquityAlertsContext);
  if (!ctx) throw new Error('useEquityAlerts must be used within EquityAlertsProvider');
  return ctx;
}

/** Equity strategy + voice on Stocks tab; background analysis when other tabs are open. */
export function EquityAlertsProvider({ children }: { children: ReactNode }) {
  const voiceEnabled = useVoiceAlertsEnabled();
  const {
    symbols,
    loading: watchlistLoading,
    error: watchlistError,
    refresh: refreshWatchlist,
    addSymbol,
    removeSymbol,
    importSymbols,
  } = useEquityWatchlist();
  const { filters } = useEquitySuggestSettings();
  const { autoTrading } = useEquityTradingSettings();
  const { data, loading: analysisLoading, error: analysisError, refresh: refreshAnalysis } =
    useEquityAnalysis(symbols, 30_000, filters);
  const { logs: orderLogs, appendFromSocket } = useSharedOrderLog();

  const ranked = useMemo(() => {
    if (data?.ranked?.length) return data.ranked;
    return rankSuggestedStocks(data?.stocks ?? [], filters);
  }, [data?.ranked, data?.stocks, filters]);

  const topPick = data?.topPick ?? ranked[0] ?? null;

  const profitableHint = useMemo((): EquityProfitableHint | null => {
    if (!topPick) return null;
    return {
      symbol: topPick.symbol,
      confidence: topPick.analysis.confidence ?? 0,
      rewardPct: topPick.rewardPct ?? 0,
      profitScore: topPick.profitScore ?? 0,
    };
  }, [topPick]);

  const equityLogs = useMemo(() => filterEquityOrderLogs(orderLogs), [orderLogs]);

  const openEquityOrders = useMemo(() => {
    const exitByBuyId = buildExitByBuyId(equityLogs);
    return equityLogs
      .filter(
        (r) =>
          r.action === 'BUY' &&
          (r.assetType === 'equity' || r.optionType === 'EQ') &&
          outcomeFromLog(r, exitByBuyId) === 'Open'
      )
      .map((r) => ({
        id: String(r.orderId || r.id),
        symbol: String(r.equitySymbol || '').toUpperCase(),
        entry: Number(r.entry) || 0,
        sl: Number(r.sl) || 0,
        tgt: Number(r.tgt) || 0,
        status: r.status,
      }))
      .filter((r) => r.symbol);
  }, [equityLogs]);

  const announceOrderRef = useRef<ReturnType<typeof useEquityVoiceAlerts>['announceOrderLog']>(
    () => {}
  );

  const { connected, lastSignal } = useEquitySocket({
    onOrderLog: (row) => {
      if (!isEquityOrder(row as OrderLogEntry)) return;
      appendFromSocket(row as OrderLogEntry);
      announceOrderRef.current(row);
    },
  });

  const { announceOrderLog } = useEquityVoiceAlerts({
    signal: lastSignal,
    voiceEnabled,
    autoTrading,
    filters,
  });
  announceOrderRef.current = announceOrderLog;

  useEquitySuggestVoice(ranked, voiceEnabled, autoTrading, filters);
  useEquityPositionExitVoice(voiceEnabled, openEquityOrders, data?.stocks ?? []);

  // Refresh analysis when server emits a purchase signal so the list updates with voice.
  const lastSignalTsRef = useRef(0);
  useEffect(() => {
    if (!lastSignal?.ts || lastSignal.ts === lastSignalTsRef.current) return;
    lastSignalTsRef.current = lastSignal.ts;
    void refreshAnalysis();
  }, [lastSignal, refreshAnalysis]);

  const value = useMemo<EquityAlertsContextValue>(
    () => ({
      connected,
      symbols,
      watchlistLoading,
      watchlistError,
      addSymbol,
      removeSymbol,
      importSymbols,
      refreshWatchlist,
      data,
      analysisLoading,
      analysisError,
      refreshAnalysis,
      ranked,
      topPick,
      profitableHint,
    }),
    [
      connected,
      symbols,
      watchlistLoading,
      watchlistError,
      addSymbol,
      removeSymbol,
      importSymbols,
      refreshWatchlist,
      data,
      analysisLoading,
      analysisError,
      refreshAnalysis,
      ranked,
      topPick,
      profitableHint,
    ]
  );

  return <EquityAlertsContext.Provider value={value}>{children}</EquityAlertsContext.Provider>;
}
