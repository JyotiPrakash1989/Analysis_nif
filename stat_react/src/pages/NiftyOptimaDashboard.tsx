import { useEffect, useMemo, useState } from 'react';
import { useNiftyAlerts } from '../context/NiftyAlertsContext';
import { useSharedOrderLog } from '../context/OrderLogContext';
import { readVoiceAlertsEnabled } from '../lib/strategyVoice';
import { HeaderBar } from '../components/niftyoptima/HeaderBar';
import { MainChart } from '../components/niftyoptima/MainChart';
import { OptionChainTable } from '../components/niftyoptima/OptionChainTable';
import { OrderBookTable } from '../components/niftyoptima/OrderBookTable';
import { NiftyDaySuggestions } from '../components/niftyoptima/NiftyDaySuggestions';
import { SignalCard } from '../components/niftyoptima/SignalCard';
import { useDaySuggestions, type NiftyDaySuggestion } from '../hooks/useDaySuggestions';
import { useOptionChainForSpot } from '../hooks/useOptionChainForSpot';
import { useTradingSettings } from '../hooks/useTradingSettings';
import type { OrderRow, PlacedOrderDetails, SignalPayload } from '../types/niftyoptima';
import { atmStrikeFromSpot, pickOptionChainSnapshot } from '../utils/optionChain';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

type DashboardProps = {
  authTick?: number;
};

export function NiftyOptimaDashboard({ authTick = 0 }: DashboardProps) {
  const { refresh: refreshOrderLog } = useSharedOrderLog();
  const { autoTrading, setAutoTrading, minDailyScore, setMinDailyScore, syncing: modeSyncing } =
    useTradingSettings();
  const [voiceEnabled, setVoiceEnabled] = useState(readVoiceAlertsEnabled);
  const {
    connected,
    tick,
    feedStatus,
    spotRest,
    todaySuggestion,
    openPosition,
    niftyOrders,
    logDay,
    headlineSpot,
    bars,
    announceOrderLog,
  } = useNiftyAlerts();

  const { suggestions: niftyDayFromApi, sessionDay, loading: niftySugLoading } =
    useDaySuggestions('nifty', 8000);
  const niftyDaySuggestions = useMemo(() => {
    const map = new Map<string, NiftyDaySuggestion>();
    for (const r of niftyDayFromApi as NiftyDaySuggestion[]) map.set(r.id, r);
    for (const s of tick?.dailyBestBuy?.todaySuggestions ?? []) {
      const id = `tick-${s.ts}-${s.strike}-${s.optionType}`;
      if (map.has(id)) continue;
      map.set(id, {
        id,
        ts: s.ts,
        dayKey: tick?.dailyBestBuy?.dayKey ?? '',
        assetType: 'nifty',
        status: 'active',
        side: s.side,
        optionType: s.optionType,
        strike: s.strike,
        entry: s.entry,
        sl: s.sl,
        tgt: s.tgt,
        risk: s.risk,
        confidence: s.confidence ?? null,
        signalIndex: s.signalIndex ?? null,
        rationale: s.rationale,
      });
    }
    return [...map.values()]
      .filter((s) => (s.confidence ?? 0) >= minDailyScore)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }, [tick?.dailyBestBuy, niftyDayFromApi, minDailyScore]);

  const [orderPatches, setOrderPatches] = useState<Record<string, Partial<OrderRow>>>({});
  const orders = niftyOrders.map((o) => (orderPatches[o.id] ? { ...o, ...orderPatches[o.id] } : o));

  const chainForSpot = useOptionChainForSpot(headlineSpot, 2500, authTick);
  const { chain: fallbackChain, expiry: fallbackExpiry } = pickOptionChainSnapshot(
    spotRest,
    tick,
    headlineSpot
  );
  const chain =
    chainForSpot?.chainSource === 'mstock' && chainForSpot.optionChain?.length
      ? chainForSpot.optionChain
      : chainForSpot?.optionChain?.length
        ? chainForSpot.optionChain
        : fallbackChain;
  const chainExpiry = chainForSpot?.optionChainExpiry ?? fallbackExpiry;
  const chainSource =
    chainForSpot?.chainSource === 'mstock'
      ? 'mstock'
      : chainForSpot?.chainSource ?? (chain.length ? 'sim' : 'none');
  const chainNote = chainForSpot?.chainNote;

  useEffect(() => {
    if (!authTick) return;
    void fetch(`${apiBase}/api/mstock/sync-session`, { method: 'POST' }).catch(() => {});
  }, [authTick]);

  const [executing, setExecuting] = useState(false);
  const [buyingSuggestionId, setBuyingSuggestionId] = useState<string | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [executeOk, setExecuteOk] = useState<string | null>(null);
  const [lastPlacedOrder, setLastPlacedOrder] = useState<PlacedOrderDetails | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelOk, setCancelOk] = useState<string | null>(null);

  const atm = atmStrikeFromSpot(headlineSpot);
  const indexSourceMerged = spotRest?.indexSource ?? tick?.indexSource ?? 'mock';
  const indexErrorMerged = spotRest?.indexError || tick?.indexError || '';
  const indexFromMerged = spotRest?.indexFromLastCandle ?? tick?.indexFromLastCandle;
  const ipBlocked = spotRest?.ipBlocked ?? tick?.ipBlocked ?? false;
  const whitelistIp = spotRest?.whitelistIp ?? tick?.whitelistIp ?? null;

  const onExecute = async (sig: SignalPayload, suggestionId?: string) => {
    setExecuting(true);
    setBuyingSuggestionId(suggestionId ?? null);
    setExecuteError(null);
    setExecuteOk(null);
    setLastPlacedOrder(null);
    setCancelError(null);
    setCancelOk(null);
    try {
      const res = await fetch(`${apiBase}/api/place-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'NIFTY',
          strike: sig.strike,
          optionType: sig.optionType,
          quantity: 1,
          entry: sig.entry,
          sl: sig.sl,
          tgt: sig.tgt,
        }),
      });
      let data: {
        ok?: boolean;
        message?: string;
        orderId?: string;
        mock?: boolean;
        quantity?: number;
        lots?: number;
        lotsize?: number;
        brokerQuantity?: number;
        tradingsymbol?: string;
        exchange?: string;
        producttype?: string;
        orderType?: string;
        price?: string;
        strike?: number;
        optionType?: 'CE' | 'PE';
        entry?: number;
        sl?: number;
        tgt?: number;
        targetSellOrderId?: string;
        targetSellOk?: boolean;
        stopLossSellOrderId?: string;
        stopLossSellOk?: boolean;
        bracketStoploss?: string;
        bracketSquareoff?: string;
      };
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.ok
            ? 'Invalid response from server'
            : `Order request failed (HTTP ${res.status}). Is the API running? Use npm run dev.`
        );
      }
      if (!res.ok || data.ok === false) {
        setExecuteError(String(data.message || `Order failed (HTTP ${res.status})`));
        setLastPlacedOrder(null);
        return;
      }
      const orderId = String(data.orderId ?? '').trim();
      if (!orderId) {
        setExecuteError('Order response missing order ID — check mStock order book.');
        setLastPlacedOrder(null);
        return;
      }
      const lots = data.lots ?? data.quantity ?? 1;
      const lotsize = data.lotsize ?? 75;
      const units = data.brokerQuantity ?? lots * lotsize;
      const placed: PlacedOrderDetails = {
        orderId: orderId,
        mock: data.mock,
        strike: sig.strike,
        side: sig.side,
        optionType: sig.optionType,
        lots,
        units,
        lotsize,
        entry: sig.entry,
        sl: sig.sl,
        tgt: sig.tgt,
        tradingsymbol: data.tradingsymbol,
        exchange: data.exchange,
        producttype: data.producttype,
        orderType: data.orderType,
        status: data.mock ? 'simulated' : 'submitted',
        placedAt: Date.now(),
        targetSellOrderId: data.targetSellOrderId,
        targetSellOk: data.targetSellOk,
        stopLossSellOrderId: data.stopLossSellOrderId,
        stopLossSellOk: data.stopLossSellOk,
        bracketStoploss: data.bracketStoploss,
        bracketSquareoff: data.bracketSquareoff,
      };
      setLastPlacedOrder(placed);
      const slNote = data.stopLossSellOrderId
        ? data.stopLossSellOk === false
          ? ' Stop-loss order failed — check mStock.'
          : ' Stop-loss order placed on mStock.'
        : data.bracketStoploss
          ? ` SL ${data.bracketStoploss} pts attached on buy.`
          : '';
      setExecuteOk(
        data.mock
          ? `Simulated order placed (see details below).${slNote}`
          : `Order placed successfully — see details below.${slNote}`
      );
      void refreshOrderLog();
      announceOrderLog({
        id: `manual-${orderId}`,
        ts: Date.now(),
        dayKey: logDay || '',
        action: 'BUY',
        mode: 'manual',
        trigger: 'manual',
        strike: sig.strike,
        optionType: sig.optionType,
        lots,
        units,
        lotsize,
        entry: sig.entry,
        sl: sig.sl,
        tgt: sig.tgt,
        orderId,
        mock: data.mock,
        status: data.mock ? 'simulated' : 'submitted',
      });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Network error — start the stack with npm run dev (API + Vite).';
      setExecuteError(msg);
    } finally {
      setExecuting(false);
      setBuyingSuggestionId(null);
    }
  };

  const onCancelOrder = async () => {
    if (!lastPlacedOrder) return;
    setCancelling(true);
    setCancelError(null);
    setCancelOk(null);
    try {
      const res = await fetch(`${apiBase}/api/cancel-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: lastPlacedOrder.orderId,
          variety: 'NORMAL',
        }),
      });
      let data: { ok?: boolean; message?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error(`Cancel failed (HTTP ${res.status})`);
      }
      if (!res.ok || data.ok === false) {
        setCancelError(String(data.message || `Cancel failed (HTTP ${res.status})`));
        return;
      }
      const orderId = lastPlacedOrder.orderId;
      setLastPlacedOrder((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
      setOrderPatches((prev) => ({
        ...prev,
        [orderId]: { status: 'cancelled', outcome: 'Cancelled', needsLiveLtp: false },
      }));
      setCancelOk(String(data.message || 'Order cancelled'));
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Cancel request failed');
    } finally {
      setCancelling(false);
    }
  };

  const feedNote =
    indexSourceMerged === 'public' || ipBlocked
      ? feedStatus?.source === 'yahoo-index'
        ? 'Index: Yahoo ^NSEI (updates every few seconds)'
        : null
      : feedStatus?.connected === false && feedStatus?.source === 'mstock-ws'
        ? `mStock tick stream: ${feedStatus.phase ?? feedStatus.reason ?? 'reconnecting'} — index uses mStock REST quote every few seconds`
        : feedStatus?.connected === false && feedStatus?.source === 'mock-feed'
          ? `Simulated feed: ${feedStatus.reason ?? 'paused'}`
          : null;

  return (
    <div className="min-h-screen bg-nox-bg text-slate-100 flex flex-col">
      <HeaderBar
        spot={headlineSpot}
        dayChange={tick?.dayChange ?? spotRest?.dayChange ?? null}
        sentiment={tick?.sentiment ?? null}
        rsi={tick?.rsi ?? null}
        connected={connected}
        feedNote={feedNote}
        indexSource={indexSourceMerged}
        indexError={indexErrorMerged}
        indexFromLastCandle={indexFromMerged}
        ipBlocked={ipBlocked}
        whitelistIp={whitelistIp}
      />
      <main className="flex-1 max-w-6xl mx-auto w-full px-3 py-4 space-y-4">
        {todaySuggestion ? (
          <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            Profitable NIFTY strategy live — {todaySuggestion.optionType} @ strike {todaySuggestion.strike}
            {todaySuggestion.confidence != null ? ` (${todaySuggestion.confidence}% score)` : ''}. Analysis runs in
            parallel with stocks.
          </p>
        ) : (
          <p className="text-[11px] text-nox-muted">
            NIFTY + stock scanners run together in the background — a profitable setup appears here when scored ≥
            {minDailyScore}%.
          </p>
        )}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Nifty intraday · 1m · EMA 9 &amp; VWAP</h2>
            <span className="text-[11px] text-nox-muted">Lightweight Charts</span>
          </div>
          <MainChart bars={bars ?? []} height={380} />
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <SignalCard
            signal={todaySuggestion}
            openPosition={openPosition}
            onExecute={onExecute}
            executing={executing}
            executeError={executeError}
            executeOk={executeOk}
            placedOrder={lastPlacedOrder}
            onCancelOrder={onCancelOrder}
            cancelling={cancelling}
            cancelError={cancelError}
            cancelOk={cancelOk}
            indexSource={indexSourceMerged}
            tick={tick}
            headlineSpot={headlineSpot}
            rsi={tick?.rsi ?? spotRest?.rsi ?? null}
            prior15={tick?.prior15 ?? spotRest?.prior15 ?? null}
            strategyRules={tick?.strategyRules ?? spotRest?.strategyRules}
            dailyBestBuy={tick?.dailyBestBuy}
            optionChain={chain}
            voiceEnabled={voiceEnabled}
            onVoiceEnabledChange={setVoiceEnabled}
            minDailyScore={minDailyScore}
            onMinDailyScoreChange={setMinDailyScore}
            autoTrading={autoTrading}
            modeSyncing={modeSyncing}
            onAutoTradingChange={setAutoTrading}
          />
          <div className="rounded-xl border border-nox-line bg-nox-surface p-4 text-sm text-nox-muted space-y-2">
            <p className="text-white font-semibold text-sm">Parallel analysis</p>
            <ul className="list-disc pl-4 space-y-1 text-xs leading-relaxed">
              <li>NIFTY CE/PE scoring runs on every tab via live socket feed.</li>
              <li>Equity watchlist scans every 30s — switch to Stocks for buy picks.</li>
              <li>Tab labels highlight when a profitable strategy is ready.</li>
            </ul>
            <p className="text-[11px] pt-2 italic text-amber-200/90">
              Intraday options are high-risk. This tool assists decisions; supervise execution.
            </p>
          </div>
        </div>
        <NiftyDaySuggestions
          suggestions={niftyDaySuggestions}
          day={sessionDay || tick?.dailyBestBuy?.dayKey || logDay}
          loading={niftySugLoading}
          optionChain={chain}
          onBuy={(sig, suggestionId) => void onExecute(sig, suggestionId)}
          buyingId={buyingSuggestionId}
          buyDisabled={executing}
          minDailyScore={minDailyScore}
        />
        <OrderBookTable
          orders={orders}
          liveSpot={headlineSpot}
          logDay={logDay}
          autoTrading={autoTrading}
        />
        <OptionChainTable
          rows={chain}
          atm={atm}
          expiry={chainExpiry}
          spotRef={headlineSpot}
          chainSource={chainSource}
          chainNote={chainNote}
        />
      </main>
    </div>
  );
}
