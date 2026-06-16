import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { useHoldPositionVoice } from '../hooks/useHoldPositionVoice';
import { useLiveNiftySpot } from '../hooks/useLiveNiftySpot';
import { useNiftySocket } from '../hooks/useNiftySocket';
import { usePositionExitVoice } from '../hooks/usePositionExitVoice';
import { useTradingSettings } from '../hooks/useTradingSettings';
import { useTradingVoiceAlerts } from '../hooks/useTradingVoiceAlerts';
import { useVoiceAlertsEnabled } from '../hooks/useVoiceAlertsEnabled';
import { filterNiftyOrderLogs, filterNiftyOrderRows, isNiftyOptionOrder } from '../lib/orderAsset';
import { resolveTodaySuggestionSignal } from '../lib/todayBestSignal';
import type { OrderLogEntry, OrderRow, SignalPayload, TickPayload } from '../types/niftyoptima';
import { applyLiveLtpToRows, orderLogsToRows } from '../types/niftyoptima';
import { pickOptionChainSnapshot, resolveHeadlineSpot } from '../utils/optionChain';
import { useSharedOrderLog } from './OrderLogContext';

export type NiftyProfitableHint = {
  optionType: 'CE' | 'PE';
  strike: number;
  confidence: number | null;
  entry: number;
};

type NiftyAlertsContextValue = {
  connected: boolean;
  tick: TickPayload | null;
  signal: SignalPayload | null;
  feedStatus: ReturnType<typeof useNiftySocket>['feedStatus'];
  spotRest: ReturnType<typeof useLiveNiftySpot>;
  todaySuggestion: SignalPayload | null;
  openPosition: OrderRow | null;
  niftyOrders: OrderRow[];
  logDay: string;
  headlineSpot: number | null;
  bars: TickPayload['bars1m'];
  chain: TickPayload['optionChain'];
  profitableHint: NiftyProfitableHint | null;
  announceOrderLog: (row: OrderLogEntry) => void;
};

const NiftyAlertsContext = createContext<NiftyAlertsContextValue | null>(null);

export function useNiftyAlerts() {
  const ctx = useContext(NiftyAlertsContext);
  if (!ctx) throw new Error('useNiftyAlerts must be used within NiftyAlertsProvider');
  return ctx;
}

/** Always-on NIFTY index feed + strategy scoring (runs in parallel with equity analysis). */
export function NiftyAlertsProvider({
  children,
  authTick = 0,
}: {
  children: ReactNode;
  authTick?: number;
  activeTab?: ViewMode;
}) {
  const voiceEnabled = useVoiceAlertsEnabled();
  const { autoTrading, minDailyScore } = useTradingSettings();
  const { logs, day: logDay, appendFromSocket } = useSharedOrderLog();
  const announceOrderRef = useRef<(row: OrderLogEntry) => void>(() => {});

  const { connected, tick, signal, feedStatus } = useNiftySocket({
    onOrderLog: (row) => {
      if (!isNiftyOptionOrder(row)) return;
      appendFromSocket(row);
      announceOrderRef.current(row);
    },
  });

  const spotRest = useLiveNiftySpot(2500, authTick);
  const liveBars = tick?.bars1m?.length ? tick.bars1m : spotRest?.bars1m;
  const bars = liveBars?.length ? liveBars : (tick?.bars1m ?? []);
  const headlineSpot = resolveHeadlineSpot(spotRest, tick, bars);
  const { chain } = pickOptionChainSnapshot(spotRest, tick, headlineSpot);

  const niftyLogs = useMemo(() => filterNiftyOrderLogs(logs), [logs]);
  const niftyOrders = useMemo(() => {
    const rows = orderLogsToRows(niftyLogs);
    return filterNiftyOrderRows(applyLiveLtpToRows(rows, chain));
  }, [niftyLogs, chain]);

  const openPosition =
    niftyOrders.find((o) => o.action === 'BUY' && o.outcome === 'Open' && isNiftyOptionOrder(o)) ?? null;

  const todaySuggestion = useMemo(
    () => resolveTodaySuggestionSignal(tick, signal, openPosition, minDailyScore),
    [tick, signal, openPosition, minDailyScore]
  );

  const profitableHint = useMemo((): NiftyProfitableHint | null => {
    if (!todaySuggestion) return null;
    return {
      optionType: todaySuggestion.optionType,
      strike: todaySuggestion.strike,
      confidence: todaySuggestion.confidence ?? null,
      entry: todaySuggestion.entry,
    };
  }, [todaySuggestion]);

  const { announceOrderLog } = useTradingVoiceAlerts({
    signal: todaySuggestion,
    voiceEnabled,
    autoTrading,
  });
  announceOrderRef.current = announceOrderLog;

  usePositionExitVoice(voiceEnabled, niftyOrders, chain);
  useHoldPositionVoice(voiceEnabled, tick?.dailyBestBuy?.holdSuggestion);

  const value = useMemo<NiftyAlertsContextValue>(
    () => ({
      connected,
      tick,
      signal,
      feedStatus,
      spotRest,
      todaySuggestion,
      openPosition,
      niftyOrders,
      logDay,
      headlineSpot,
      bars,
      chain,
      profitableHint,
      announceOrderLog,
    }),
    [
      connected,
      tick,
      signal,
      feedStatus,
      spotRest,
      todaySuggestion,
      openPosition,
      niftyOrders,
      logDay,
      headlineSpot,
      bars,
      chain,
      profitableHint,
      announceOrderLog,
    ]
  );

  return <NiftyAlertsContext.Provider value={value}>{children}</NiftyAlertsContext.Provider>;
}
