import { useMemo, useState } from 'react';
import type { EquityDaySuggestionRow } from '../types/equityStrategy';
import { useEquityAlerts } from '../context/EquityAlertsContext';
import { useEquitySuggestSettings } from '../hooks/useEquitySuggestSettings';
import { useEquityBuy } from '../hooks/useEquityBuy';
import { useEquityTradingSettings } from '../hooks/useEquityTradingSettings';
import { useVoiceAlertsEnabled } from '../hooks/useVoiceAlertsEnabled';
import { speakEquityOrderLog, writeVoiceAlertsEnabled } from '../lib/strategyVoice';
import { EquityBuyQuantityDialog } from '../components/equity/EquityBuyQuantityDialog';
import { EquityTradingControls } from '../components/equity/EquityTradingControls';
import { SuggestedStocksSection } from '../components/equity/SuggestedStocksSection';
import { useDaySuggestions } from '../hooks/useDaySuggestions';
import { StockWatchlistPanel } from '../components/equity/StockWatchlistPanel';
import { WatchlistStocksSection } from '../components/equity/WatchlistStocksSection';
import type { StockSnapshot } from '../types/equityStrategy';

export function StocksPage() {
  const {
    connected,
    symbols,
    watchlistError,
    addSymbol,
    removeSymbol,
    importSymbols,
    data,
    analysisLoading: loading,
    analysisError: error,
    refreshAnalysis: refresh,
    ranked,
    topPick,
  } = useEquityAlerts();
  const { filters, setSuggestFilters, syncing: filtersSyncing } = useEquitySuggestSettings();
  const { autoTrading, setAutoTrading, syncing } = useEquityTradingSettings();
  const { buyNow, buyingSymbol, lastResult } = useEquityBuy();
  const voiceEnabled = useVoiceAlertsEnabled();
  const [buyPromptStock, setBuyPromptStock] = useState<StockSnapshot | null>(null);
  const { suggestions: equityDayFromApi, sessionDay, loading: equitySugLoading } =
    useDaySuggestions('equity', 8000);
  const equityDaySuggestions = useMemo(() => {
    const map = new Map<string, EquityDaySuggestionRow>();
    for (const r of equityDayFromApi as EquityDaySuggestionRow[]) map.set(r.id, r);
    for (const r of data?.daySuggestions ?? []) map.set(r.id, r);
    return [...map.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }, [equityDayFromApi, data?.daySuggestions]);

  function handleBuyClick(stock: StockSnapshot) {
    setBuyPromptStock(stock);
  }

  async function handleBuyConfirm(quantity: number) {
    const stock = buyPromptStock;
    if (!stock) return;
    const result = await buyNow(stock, quantity);
    if (result != null) setBuyPromptStock(null);
    if (result?.ok && voiceEnabled) {
      speakEquityOrderLog({
        equitySymbol: stock.symbol,
        action: 'BUY',
        mode: 'manual',
        entry: stock.ltp,
        tgt: stock.analysis.tgt ?? undefined,
        status: 'open',
        units: quantity,
      });
    }
  }

  async function handleRemove(sym: string) {
    await removeSymbol(sym);
    void refresh();
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <header className="border-b border-nox-line bg-nox-surface/80 backdrop-blur px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-nox-muted">Equity intraday</p>
        <h1 className="text-xl font-semibold text-white">Stock purchase analyzer</h1>
        <p className="text-xs text-nox-muted mt-1">
          Intraday strategy runs only on stocks you add below — best picks ranked from your list.
        </p>
        <p className="text-[11px] text-nox-muted mt-1">
          Socket:{' '}
          <span className={connected ? 'text-emerald-400' : 'text-rose-400'}>
            {connected ? 'live' : 'reconnecting…'}
          </span>
        </p>
        {error || watchlistError ? (
          <p className="text-xs text-rose-400 mt-2">{error || watchlistError}</p>
        ) : null}
        {lastResult ? (
          <p className={`text-xs mt-1 ${lastResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
            {lastResult.symbol}: {lastResult.message}
          </p>
        ) : null}
        {data?.analyzedAt ? (
          <p className="text-[11px] text-nox-muted mt-1">
            Last updated {new Date(data.analyzedAt).toLocaleTimeString('en-IN')} · scans with NIFTY in parallel
          </p>
        ) : null}
        {topPick ? (
          <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 mt-2">
            Profitable stock strategy — {topPick.symbol} ({topPick.analysis.confidence}% confidence, +
            {(topPick.rewardPct ?? 0).toFixed(1)}% target).
          </p>
        ) : (
          <p className="text-[11px] text-nox-muted mt-2">
            Stock + NIFTY scanners run together — profitable buys appear here when filters are met.
          </p>
        )}
      </header>

      <div className="flex-1 overflow-auto p-4 max-w-6xl mx-auto w-full space-y-5">
        <EquityTradingControls
          voiceEnabled={voiceEnabled}
          onVoiceEnabledChange={(on) => writeVoiceAlertsEnabled(on)}
          autoTrading={autoTrading}
          syncing={syncing}
          onAutoTradingChange={setAutoTrading}
          suggestFilters={filters}
        />
        <SuggestedStocksSection
          ranked={ranked}
          topPick={topPick}
          allStocks={data?.stocks ?? []}
          filters={filters}
          onFiltersChange={(patch) => void setSuggestFilters(patch)}
          filtersSyncing={filtersSyncing}
          loading={loading}
          onBuy={handleBuyClick}
          buyingSymbol={buyingSymbol}
          daySuggestions={equityDaySuggestions}
          sessionDay={sessionDay || data?.daySuggestions?.[0]?.dayKey}
          daySuggestionsLoading={equitySugLoading}
          scanMeta={data?.scanMeta}
        />
        <EquityBuyQuantityDialog
          stock={buyPromptStock}
          placing={buyPromptStock != null && buyingSymbol === buyPromptStock.symbol}
          onClose={() => setBuyPromptStock(null)}
          onConfirm={(quantity) => void handleBuyConfirm(quantity)}
        />
        <StockWatchlistPanel
          symbols={symbols}
          onAdd={addSymbol}
          onRemove={removeSymbol}
          onImport={(incoming) => importSymbols(incoming, 'merge')}
          onAnalyze={() => void refresh()}
          analyzing={loading}
        />
        <WatchlistStocksSection
          symbols={symbols}
          stocks={data?.stocks ?? []}
          loading={loading}
          onRemove={handleRemove}
        />
      </div>
    </div>
  );
}
