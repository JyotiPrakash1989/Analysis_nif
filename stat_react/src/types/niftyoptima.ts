/** Intraday NIFTY move vs previous close (or today open). */
export type NiftyDayChange = {
  prevClose: number;
  dayOpen: number | null;
  points: number;
  percent: number;
  /** prevClose = prior session; open = today open only */
  basis: 'prevClose' | 'open';
};

export type MinuteBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type FifteenBar = {
  open: number;
  high: number;
  low: number;
  close: number;
  start: number;
  end: number;
};

export type OptionLeg = {
  ltp: number;
  oiChangePct: number;
  volume: number;
};

export type OptionChainRow = {
  strike: number;
  ce: OptionLeg;
  pe: OptionLeg;
};

export type StrategyRuleLeg = {
  brokeUp?: boolean;
  brokeDown?: boolean;
  rsiOk: boolean;
  ready: boolean;
  priorHigh?: number;
  priorLow?: number;
  rsiMin?: number;
  rsiMax?: number;
};

export type TickPayload = {
  ts: number;
  spot: number;
  dayChange?: NiftyDayChange | null;
  rsi: number | null;
  prior15: FifteenBar | null;
  current15: FifteenBar | null;
  atm: number;
  optionChain: OptionChainRow[];
  /** Nearest NIFTY weekly expiry (YYYY-MM-DD, NSE Tuesday). */
  optionChainExpiry?: string;
  sentiment: number;
  bars1m: MinuteBar[];
  indexSource?: 'mock' | 'mstock' | 'pending' | 'public';
  indexError?: string;
  indexPollAt?: number;
  indexFromLastCandle?: boolean;
  ipBlocked?: boolean;
  whitelistIp?: string | null;
  strategyRules?: {
    ce: StrategyRuleLeg | null;
    pe: StrategyRuleLeg | null;
  };
  /** Multiple best buys per IST day (server-scored CE vs PE per 15m window). */
  dailyBestBuy?: {
    confidence: number | null;
    ceScore: number;
    peScore: number;
    dayKey: string;
    signalsToday: number;
    signal?: SignalPayload | null;
    suppressedByPosition?: boolean;
    hasOpenPosition?: boolean;
    holdSuggestion?: HoldSuggestion | null;
    /** Scored setup blocked by an open position — shown when more profitable than holding. */
    candidateSignal?: SignalPayload | null;
    /** All NIFTY suggestions logged today (separate from equity). */
    todaySuggestions?: Array<
      SignalPayload & { id?: string; status?: string; assetType?: string; dayKey?: string }
    >;
  };
};

/** Voice-only hint when a new setup fires but an open position blocks a new signal. */
export type HoldSuggestion = {
  ts: number;
  strike: number;
  optionType: 'CE' | 'PE';
  entry: number;
  sl: number;
  tgt: number;
  suppressedSide?: 'CE' | 'PE';
  suppressedScore?: number;
  reason: string;
};

export type SignalPayload = {
  side: 'CE' | 'PE';
  strike: number;
  optionType: 'CE' | 'PE';
  entry: number;
  sl: number;
  tgt: number;
  risk: number;
  rationale: string;
  ts: number;
  /** Set when this is a scored daily best-buy pick. */
  dailyPick?: boolean;
  confidence?: number;
  /** 1-based index of this signal within the IST trading day. */
  signalIndex?: number;
};

/** Last order placed from the signal card (for details + cancel). */
export type PlacedOrderDetails = {
  orderId: string;
  mock?: boolean;
  strike: number;
  side: 'CE' | 'PE';
  optionType: 'CE' | 'PE';
  lots: number;
  units: number;
  lotsize: number;
  entry: number;
  sl: number;
  tgt: number;
  tradingsymbol?: string;
  exchange?: string;
  producttype?: string;
  orderType?: string;
  status: string;
  placedAt: number;
  targetSellOrderId?: string;
  targetSellOk?: boolean;
  stopLossSellOrderId?: string;
  stopLossSellOk?: boolean;
  bracketStoploss?: string;
  bracketSquareoff?: string;
};

export type OrderLogEntry = {
  id: string;
  ts: number;
  dayKey: string;
  action: 'BUY' | 'SELL' | 'UPDATE';
  mode: 'auto' | 'manual';
  trigger: string;
  assetType?: 'equity' | string;
  equitySymbol?: string;
  strike: number;
  optionType: 'CE' | 'PE' | 'EQ';
  lots?: number;
  units?: number;
  lotsize?: number;
  entry?: number;
  sl?: number;
  tgt?: number;
  exitPrice?: number;
  ltp?: number;
  orderId?: string;
  parentBuyId?: string;
  mock?: boolean;
  status: string;
  message?: string;
};

export type OrderRow = {
  id: string;
  time: number;
  label: string;
  side: 'CE' | 'PE' | 'EQ';
  assetType?: 'equity' | string;
  equitySymbol?: string;
  strike: number;
  action?: 'BUY' | 'SELL';
  mode?: 'auto' | 'manual';
  trigger?: string;
  /** Lots ordered (e.g. 1). */
  qty: number;
  /** Units sent to broker (lots × lot size, e.g. 75). */
  units?: number;
  lotsize?: number;
  entry: number;
  sl: number;
  tgt: number;
  ltp: number;
  pnl: number;
  status: string;
  /** Target achieved, stop loss triggered, open, etc. */
  outcome: string;
  /** Open buy rows — fill LTP from live option chain. */
  needsLiveLtp?: boolean;
};

const CLOSING_SELL_STATUSES = new Set(['target_exit', 'stoploss_exit', 'closed']);
const PENDING_SELL_STATUSES = new Set(['submitted', 'target_pending', 'stoploss_pending']);
const OPEN_BUY_STATUSES = new Set(['open', 'submitted', 'simulated']);

function exitPriceFromEntry(entry: OrderLogEntry): number | null {
  const px = Number(entry.exitPrice ?? entry.ltp);
  return Number.isFinite(px) && px > 0 ? px : null;
}

/** Static LTP from log data (before live option-chain merge). */
export function resolveRowLtp(
  entry: OrderLogEntry,
  exitByBuyId: Map<string, OrderLogEntry>
): { ltp: number; needsLiveLtp: boolean } {
  if (entry.action === 'SELL') {
    if (PENDING_SELL_STATUSES.has(entry.status)) {
      return { ltp: 0, needsLiveLtp: false };
    }
    const px = exitPriceFromEntry(entry);
    return { ltp: px ?? 0, needsLiveLtp: false };
  }

  const buyId = entry.orderId != null ? String(entry.orderId) : '';
  const exit = buyId ? exitByBuyId.get(buyId) : undefined;
  if (exit) {
    if (exit.action === 'SELL') {
      const px = exitPriceFromEntry(exit);
      return { ltp: px ?? (Number(entry.entry) || 0), needsLiveLtp: false };
    }
    if (exit.trigger === 'target' || exit.trigger === 'stoploss') {
      const px = Number(entry.tgt && exit.trigger === 'target' ? entry.tgt : entry.sl);
      if (Number.isFinite(px) && px > 0) return { ltp: px, needsLiveLtp: false };
    }
  }

  if (OPEN_BUY_STATUSES.has(entry.status)) {
    const logged = Number(entry.ltp);
    if (Number.isFinite(logged) && logged > 0) {
      return { ltp: logged, needsLiveLtp: true };
    }
    return { ltp: 0, needsLiveLtp: true };
  }

  const px = Number(entry.ltp ?? entry.entry);
  return { ltp: Number.isFinite(px) ? px : 0, needsLiveLtp: false };
}

export function buildLtpMap(chain: OptionChainRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of chain) {
    const ceLtp = row.ce?.ltp;
    const peLtp = row.pe?.ltp;
    if (ceLtp != null && Number.isFinite(ceLtp)) map.set(`${row.strike}-CE`, ceLtp);
    if (peLtp != null && Number.isFinite(peLtp)) map.set(`${row.strike}-PE`, peLtp);
  }
  return map;
}

/** Apply live option-chain premiums to open buy rows. */
export function applyLiveLtpToRows(rows: OrderRow[], chain: OptionChainRow[]): OrderRow[] {
  if (!chain.length) return rows;
  const ltpMap = buildLtpMap(chain);
  return rows.map((o) => {
    if (!o.needsLiveLtp || o.assetType === 'equity' || o.side === 'EQ') return o;
    const live = ltpMap.get(`${o.strike}-${o.side}`);
    if (live == null || !Number.isFinite(live)) return o;
    const units = o.units ?? o.qty * (o.lotsize ?? 75);
    return { ...o, ltp: live, pnl: (live - o.entry) * units };
  });
}

/** Apply live equity spot prices to open equity buy rows. */
export function applyEquityLiveLtpToRows(
  rows: OrderRow[],
  ltpBySymbol: Map<string, number> | Record<string, number>
): OrderRow[] {
  const map = ltpBySymbol instanceof Map ? ltpBySymbol : new Map(Object.entries(ltpBySymbol));
  if (!map.size) return rows;
  return rows.map((o) => {
    if (!o.needsLiveLtp || o.assetType !== 'equity') return o;
    const sym = String(o.equitySymbol || '').toUpperCase();
    const live = map.get(sym);
    if (live == null || !Number.isFinite(live)) return o;
    const units = o.units ?? o.qty * (o.lotsize ?? 1);
    return { ...o, ltp: live, pnl: (live - o.entry) * units };
  });
}

export function formatOrderLtp(ltp: number): string {
  return Number.isFinite(ltp) && ltp > 0 ? ltp.toFixed(2) : '—';
}

function exitOutcomeFromEntry(entry: OrderLogEntry): string | null {
  if (entry.status === 'target_exit' || (entry.status === 'closed' && entry.trigger === 'target')) {
    return 'Target achieved';
  }
  if (entry.status === 'stoploss_exit' || (entry.status === 'closed' && entry.trigger === 'stoploss')) {
    return 'Stop loss triggered';
  }
  return null;
}

/** Completed exit SELL rows keyed by parent buy order id. */
export function buildExitByBuyId(logs: OrderLogEntry[]): Map<string, OrderLogEntry> {
  const exitByBuyId = new Map<string, OrderLogEntry>();
  for (const r of logs) {
    if (r.action === 'SELL' && r.parentBuyId && CLOSING_SELL_STATUSES.has(r.status)) {
      exitByBuyId.set(String(r.parentBuyId), r);
    }
  }
  for (const r of logs) {
    if (r.action !== 'UPDATE' || r.status !== 'closed' || !r.orderId) continue;
    const buyId = String(r.orderId);
    if (exitByBuyId.has(buyId)) continue;
    exitByBuyId.set(buyId, r);
  }
  return exitByBuyId;
}

/** Live outcome when price crosses target or stop-loss on an open buy. */
export function liveExitOutcome(row: OrderRow, ltp: number): string | null {
  if (row.action !== 'BUY' || row.outcome !== 'Open') return null;
  if (!Number.isFinite(ltp) || ltp <= 0) return null;
  const sl = Number(row.sl);
  const tgt = Number(row.tgt);
  if (Number.isFinite(sl) && sl > 0 && ltp <= sl) return 'Stop loss triggered';
  if (Number.isFinite(tgt) && tgt > 0 && ltp >= tgt) return 'Target achieved';
  return null;
}

export function outcomeFromLog(
  entry: OrderLogEntry,
  exitByBuyId: Map<string, OrderLogEntry>
): string {
  if (entry.action === 'SELL') {
    const closed = exitOutcomeFromEntry(entry);
    if (closed) return closed;
    if (
      entry.trigger === 'target' &&
      (PENDING_SELL_STATUSES.has(entry.status) || entry.status === 'simulated')
    ) {
      return 'Pending';
    }
    if (entry.trigger === 'stoploss' && PENDING_SELL_STATUSES.has(entry.status)) {
      return 'Pending';
    }
    return 'Exit';
  }
  const buyId = entry.orderId != null ? String(entry.orderId) : '';
  const exit = buyId ? exitByBuyId.get(buyId) : undefined;
  if (exit) {
    const closed =
      exit.action === 'SELL'
        ? exitOutcomeFromEntry(exit)
        : exit.trigger === 'target'
          ? 'Target achieved'
          : exit.trigger === 'stoploss'
            ? 'Stop loss triggered'
            : 'Closed';
    if (closed) return closed;
  }
  if (entry.status === 'failed') return 'Failed';
  if (entry.status === 'cancelled') return 'Cancelled';
  if (['open', 'submitted', 'simulated'].includes(entry.status)) return 'Open';
  return '—';
}

export type DayOrderSummary = {
  total: number;
  buys: number;
  sells: number;
  updates: number;
  open: number;
  targetHits: number;
  stopLossHits: number;
  failed: number;
  auto: number;
  manual: number;
  realizedPnl: number;
};

export function summarizeDayLogs(logs: OrderLogEntry[]): DayOrderSummary {
  const exitByBuyId = buildExitByBuyId(logs);

  let open = 0;
  let targetHits = 0;
  let stopLossHits = 0;
  let failed = 0;
  let auto = 0;
  let manual = 0;
  let realizedPnl = 0;

  for (const r of logs) {
    if (r.mode === 'auto') auto += 1;
    if (r.mode === 'manual') manual += 1;
    if (r.status === 'failed') failed += 1;

    if (r.action === 'BUY') {
      const outcome = outcomeFromLog(r, exitByBuyId);
      if (outcome === 'Open') open += 1;
      if (outcome === 'Target achieved') targetHits += 1;
      if (outcome === 'Stop loss triggered') stopLossHits += 1;
    }

    if (r.action === 'SELL' && (r.status === 'target_exit' || r.status === 'stoploss_exit' || r.status === 'closed')) {
      const entry = Number(r.entry) || 0;
      const exit = Number(r.exitPrice ?? r.ltp ?? entry) || entry;
      const units = r.units ?? (r.lots ?? 1) * (r.lotsize ?? 75);
      realizedPnl += (exit - entry) * units;
    }
  }

  return {
    total: logs.length,
    buys: logs.filter((r) => r.action === 'BUY').length,
    sells: logs.filter((r) => r.action === 'SELL').length,
    updates: logs.filter((r) => r.action === 'UPDATE').length,
    open,
    targetHits,
    stopLossHits,
    failed,
    auto,
    manual,
    realizedPnl,
  };
}

export function orderLogsToRows(logs: OrderLogEntry[]): OrderRow[] {
  const exitByBuyId = buildExitByBuyId(logs);

  return logs
    .filter((r) => r.action === 'BUY' || r.action === 'SELL')
    .map((r) => {
      const entry = Number(r.entry) || 0;
      const { ltp, needsLiveLtp } = resolveRowLtp(r, exitByBuyId);
      const units = r.units ?? (r.lots ?? 1) * (r.lotsize ?? 75);
      const pnl = ltp > 0 ? (ltp - entry) * units : 0;
      const isEquity = r.assetType === 'equity' || r.optionType === 'EQ';
      const equitySymbol = r.equitySymbol ? String(r.equitySymbol).toUpperCase() : undefined;
      return {
        id: String(r.orderId || r.id),
        time: r.ts,
        label: isEquity && equitySymbol ? equitySymbol : `NIFTY ${r.strike} ${r.optionType}`,
        side: r.optionType,
        assetType: isEquity ? 'equity' : r.assetType,
        equitySymbol,
        strike: r.strike,
        action: r.action,
        mode: r.mode,
        trigger: r.trigger,
        qty: r.lots ?? 1,
        units,
        lotsize: r.lotsize,
        entry,
        sl: Number(r.sl) || 0,
        tgt: Number(r.tgt) || 0,
        ltp,
        pnl,
        status: r.status,
        outcome: outcomeFromLog(r, exitByBuyId),
        needsLiveLtp,
      };
    })
    .reverse();
}
