import { useMemo, useRef } from 'react';
import { istDayKey } from '../../lib/istDay';
import { formatPremium, resolveFixedStrategyLevels } from '../../lib/signalLevels';
import { DEFAULT_MIN_DAILY_SCORE } from '../../lib/tradingMode';
import { todayLeadingSide } from '../../lib/todayBestSignal';
import type {
  FifteenBar,
  OptionChainRow,
  OrderRow,
  SignalPayload,
  StrategyRuleLeg,
  TickPayload,
} from '../../types/niftyoptima';
import type { PlacedOrderDetails } from '../../types/niftyoptima';
import { PlacedOrderPanel } from './PlacedOrderPanel';
import { MstockLoginPromptText } from './MstockLoginPromptText';
import { TradingModeControl } from './TradingModeControl';
import { VoiceAlertControl } from './VoiceAlertControl';

type Props = {
  signal: SignalPayload | null;
  /** When set, new strategies are hidden — user should hold for target. */
  openPosition?: OrderRow | null;
  onExecute: (sig: SignalPayload) => void;
  executing: boolean;
  executeError?: string | null;
  executeOk?: string | null;
  placedOrder?: PlacedOrderDetails | null;
  onCancelOrder?: () => void;
  cancelling?: boolean;
  cancelError?: string | null;
  cancelOk?: string | null;
  indexSource?: 'mock' | 'mstock' | 'pending' | 'public';
  tick?: TickPayload | null;
  headlineSpot?: number | null;
  rsi?: number | null;
  prior15?: FifteenBar | null;
  strategyRules?: {
    ce: StrategyRuleLeg | null;
    pe: StrategyRuleLeg | null;
  };
  dailyBestBuy?: TickPayload['dailyBestBuy'];
  /** Used once to correct opposite-leg premium mistakes; levels stay fixed after. */
  optionChain?: OptionChainRow[];
  voiceEnabled: boolean;
  onVoiceEnabledChange: (on: boolean) => void;
  autoTrading?: boolean;
  modeSyncing?: boolean;
  onAutoTradingChange?: (auto: boolean) => void;
  minDailyScore?: number;
  onMinDailyScoreChange?: (score: number) => void;
};

function feedNote(indexSource: Props['indexSource']) {
  const src = indexSource ?? 'mock';
  if (src === 'mstock') {
    return 'Signals use mStock Type B 1m history + live index (same broker as execution). Option chain uses mStock when logged in.';
  }
  if (src === 'public') {
    return 'Yahoo fallback is on (NIFTY_PUBLIC_SPOT_FALLBACK=1). Set it to 0 in .env to use mStock only.';
  }
  if (src === 'pending') {
    return 'Waiting for mStock session — complete SMS OTP login on this app so signals use broker 1m bars.';
  }
  return 'Signals use a simulated tick engine for demo (no MSTOCK_API_KEY).';
}

function ruleStatus(leg: StrategyRuleLeg | null | undefined, kind: 'CE' | 'PE') {
  if (!leg) return 'Need ~30 closed 1m bars for prior 15m range';
  const parts: string[] = [];
  if (kind === 'CE') {
    parts.push(leg.brokeUp ? 'Above prior 15m high' : 'Break above prior 15m high');
    parts.push(leg.rsiOk ? `RSI > ${leg.rsiMin}` : `RSI > ${leg.rsiMin} (now failing)`);
  } else {
    parts.push(leg.brokeDown ? 'Below prior 15m low' : 'Break below prior 15m low');
    parts.push(leg.rsiOk ? `RSI < ${leg.rsiMax}` : `RSI < ${leg.rsiMax} (now failing)`);
  }
  return parts.join(' · ');
}

export function SignalCard({
  signal,
  openPosition,
  onExecute,
  executing,
  executeError,
  executeOk,
  placedOrder,
  onCancelOrder,
  cancelling = false,
  cancelError,
  cancelOk,
  indexSource,
  tick,
  headlineSpot,
  rsi: rsiProp,
  prior15: priorProp,
  strategyRules: rulesProp,
  dailyBestBuy: dailyMeta,
  optionChain = [],
  voiceEnabled,
  onVoiceEnabledChange,
  autoTrading = false,
  modeSyncing = false,
  onAutoTradingChange,
  minDailyScore = DEFAULT_MIN_DAILY_SCORE,
  onMinDailyScoreChange,
}: Props) {
  const src = indexSource ?? 'mock';
  const spot = headlineSpot ?? tick?.spot ?? null;
  const rsi = rsiProp ?? tick?.rsi;
  const prior = priorProp ?? tick?.prior15;
  const rules = rulesProp ?? tick?.strategyRules;

  const frozenSignalKey = useRef<string | null>(null);
  const frozenDisplay = useRef<SignalPayload | null>(null);
  const display = useMemo(() => {
    if (!signal) {
      frozenSignalKey.current = null;
      frozenDisplay.current = null;
      return null;
    }
    const key = `${signal.ts}-${signal.strike}-${signal.optionType}`;
    if (frozenSignalKey.current !== key) {
      frozenSignalKey.current = key;
      frozenDisplay.current = resolveFixedStrategyLevels(signal, optionChain);
    } else if (optionChain.length > 0 && frozenDisplay.current) {
      const upgraded = resolveFixedStrategyLevels(signal, optionChain);
      if (
        upgraded.entry !== frozenDisplay.current.entry ||
        upgraded.sl !== frozenDisplay.current.sl ||
        upgraded.tgt !== frozenDisplay.current.tgt
      ) {
        frozenDisplay.current = upgraded;
      }
    }
    return (
      frozenDisplay.current ?? resolveFixedStrategyLevels(signal, optionChain)
    );
  }, [signal, optionChain]);
  const today = istDayKey();
  const todayMeta = dailyMeta?.dayKey === today ? dailyMeta : null;
  const awaitingSide = todayLeadingSide(todayMeta, rules, minDailyScore);

  const orderFeedback =
    executeError || executeOk || placedOrder ? (
      <div className="space-y-3 border-t border-nox-line/60 pt-3">
        {executeError ? (
          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2">
            {executeError}
          </p>
        ) : null}
        {executeOk && !executeError ? (
          <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded-lg px-3 py-2">
            {executeOk}
          </p>
        ) : null}
        {placedOrder ? (
          <PlacedOrderPanel
            order={placedOrder}
            onCancel={onCancelOrder ?? (() => {})}
            cancelling={cancelling}
            cancelError={cancelError}
            cancelOk={cancelOk}
          />
        ) : null}
      </div>
    ) : null;

  const openPositionPanel = openPosition ? (() => {
    const leg = openPosition.side;
    const label = `HOLD NIFTY ${openPosition.strike} ${leg} @ ${formatPremium(openPosition.entry)}`;
    const pnlPositive = openPosition.pnl >= 0;
    return (
      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-bold uppercase tracking-wide text-amber-400">Position open</p>
          <span className="text-xs text-nox-muted">Hold for target</span>
        </div>
        <p className="text-base font-semibold text-white">{label}</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-nox-muted text-xs">Stop-loss</p>
            <p className="text-rose-300 font-mono">{formatPremium(openPosition.sl)}</p>
          </div>
          <div>
            <p className="text-nox-muted text-xs">Target (1:2)</p>
            <p className="text-emerald-300 font-mono">{formatPremium(openPosition.tgt)}</p>
          </div>
          <div>
            <p className="text-nox-muted text-xs">Live premium</p>
            <p className="text-white font-mono">{formatPremium(openPosition.ltp)}</p>
          </div>
          <div>
            <p className="text-nox-muted text-xs">Unrealized P&amp;L</p>
            <p className={`font-mono ${pnlPositive ? 'text-emerald-300' : 'text-rose-300'}`}>
              {pnlPositive ? '+' : ''}
              {openPosition.pnl.toFixed(0)}
            </p>
          </div>
        </div>
        {!display ? (
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Waiting for a higher-scored call or put setup that beats remaining upside on this trade.
          </p>
        ) : null}
      </div>
    );
  })() : null;

  if (!signal || !display) {
    return (
      <div className="rounded-xl border border-dashed border-nox-line bg-nox-surface p-4 space-y-3 text-sm">
        {onAutoTradingChange ? (
          <TradingModeControl
            autoTrading={autoTrading}
            syncing={modeSyncing}
            onChange={onAutoTradingChange}
            minDailyScore={minDailyScore}
            onMinDailyScoreChange={onMinDailyScoreChange ?? (() => {})}
          />
        ) : null}
        <VoiceAlertControl
          enabled={voiceEnabled}
          onChange={onVoiceEnabledChange}
          autoTrading={autoTrading}
        />
        {openPositionPanel}
        <p className="text-white font-semibold">Today&apos;s best strategy — awaiting entry</p>
        <p className="text-nox-muted text-xs leading-relaxed">
          Only one side per day: the higher-scored call (CE) or put (PE) setup.{' '}
          {src === 'pending' ? (
            <MstockLoginPromptText text={feedNote(src)} className="inline text-xs" />
          ) : (
            feedNote(src)
          )}
        </p>

        {awaitingSide === 'CE' ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-1">
            <p className="text-emerald-400 text-xs font-bold uppercase tracking-wide">Today&apos;s call setup (CE)</p>
            <p className="text-[11px] text-nox-muted leading-relaxed">
              Spot breaks above the <strong className="text-slate-300">completed prior 15m high</strong> (previous 1m close
              at or below that high) and <strong className="text-slate-300">RSI(14) &gt; 62</strong>.
            </p>
            <p className="text-[11px] text-emerald-200/80">{ruleStatus(rules?.ce, 'CE')}</p>
            {rules?.ce?.ready && (
              <p className="text-xs font-bold text-emerald-300 pt-1">Ready — BUY CE</p>
            )}
          </div>
        ) : awaitingSide === 'PE' ? (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 space-y-1">
            <p className="text-rose-400 text-xs font-bold uppercase tracking-wide">Today&apos;s put setup (PE)</p>
            <p className="text-[11px] text-nox-muted leading-relaxed">
              Spot breaks below the <strong className="text-slate-300">completed prior 15m low</strong> (previous 1m close
              at or above that low) and <strong className="text-slate-300">RSI(14) &lt; 38</strong>.
            </p>
            <p className="text-[11px] text-rose-200/80">{ruleStatus(rules?.pe, 'PE')}</p>
            {rules?.pe?.ready && (
              <p className="text-xs font-bold text-rose-300 pt-1">Ready — BUY PE</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-nox-muted leading-relaxed">
            Waiting for today&apos;s best CE or PE breakout (score ≥ {minDailyScore}) on a new 15m window.
          </p>
        )}

        {(spot != null || rsi != null || prior) && (
          <div className="text-[11px] text-nox-muted font-mono border-t border-nox-line pt-2 space-y-0.5">
            {spot != null && <p>Spot: {spot.toFixed(2)}</p>}
            {rsi != null && <p>RSI(14): {rsi.toFixed(1)}</p>}
            {prior && (
              <p>
                Prior 15m: H {prior.high.toFixed(2)} · L {prior.low.toFixed(2)}
              </p>
            )}
          </div>
        )}

        {todayMeta && (
          <p className="text-[11px] text-cyan-200/90 font-mono border-t border-nox-line pt-2">
            Today ({today}): leading {awaitingSide ?? '—'} · CE score {todayMeta.ceScore.toFixed(0)} · PE score{' '}
            {todayMeta.peScore.toFixed(0)} (need ≥{minDailyScore} for a buy suggestion)
          </p>
        )}
        <p className="text-[11px] text-nox-muted italic">
          Suggestions are limited to today&apos;s best call or put (not both). With a position open, a higher-scored setup
          is shown only when it is more profitable than holding to target.
        </p>
        {orderFeedback}
      </div>
    );
  }

  const leg = display.optionType;
  const buyCe = leg === 'CE';
  const outerBorder = openPosition
    ? 'border-nox-line bg-nox-surface'
    : buyCe
      ? 'border-emerald-500/60 bg-emerald-500/10'
      : 'border-rose-500/60 bg-rose-500/10';
  const suggestionBorder = buyCe ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-rose-500/60 bg-rose-500/10';
  const title = buyCe ? 'BUY CE (call)' : 'BUY PE (put)';
  return (
    <div className={`rounded-xl border ${outerBorder} p-4 space-y-3`}>
      {onAutoTradingChange ? (
        <TradingModeControl
          autoTrading={autoTrading}
          syncing={modeSyncing}
          onChange={onAutoTradingChange}
          minDailyScore={minDailyScore}
          onMinDailyScoreChange={onMinDailyScoreChange ?? (() => {})}
        />
      ) : null}
      <VoiceAlertControl
        enabled={voiceEnabled}
        onChange={onVoiceEnabledChange}
        autoTrading={autoTrading}
      />
      {openPositionPanel}
      <div className={`rounded-lg border ${suggestionBorder} p-3 space-y-3`}>
        {openPosition ? (
          <p className="text-xs text-cyan-200/90 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2 leading-relaxed">
            More profitable setup found — review before switching. Close or hold your open trade first.
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className={`text-sm font-bold uppercase tracking-wide ${buyCe ? 'text-emerald-400' : 'text-rose-400'}`}>
            {display.dailyPick
              ? display.optionType === 'CE'
                ? openPosition
                  ? "Better call (CE) today"
                  : "Today's best call (CE)"
                : openPosition
                  ? "Better put (PE) today"
                  : "Today's best put (PE)"
              : title}
          </p>
          <span className="text-xs text-nox-muted">
            {display.dailyPick && display.confidence != null
              ? `${display.confidence}% score`
              : new Date(display.ts).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-lg font-semibold text-white">
          SUGGESTION: BUY NIFTY {display.strike} {leg} @ {formatPremium(display.entry)}
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-nox-muted text-xs">Stop-loss</p>
            <p className="text-rose-300 font-mono">{formatPremium(display.sl)}</p>
          </div>
          <div>
            <p className="text-nox-muted text-xs">Target (1:2)</p>
            <p className="text-emerald-300 font-mono">{formatPremium(display.tgt)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-nox-muted text-xs">Risk (premium)</p>
            <p className="text-white font-mono">{formatPremium(display.risk)}</p>
          </div>
        </div>
        <p className="text-xs text-nox-muted leading-relaxed">{display.rationale}</p>
        {autoTrading && !openPosition ? (
          <p className="text-xs text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            Auto mode: buy order is placed on the server when this signal fires; sell runs when LTP ≥
            target.
          </p>
        ) : !openPosition ? (
          <button
            type="button"
            disabled={executing}
            onClick={() => onExecute(display)}
            className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold py-2.5 text-sm transition-colors"
          >
            {executing ? 'Placing order…' : 'Execute trade (manual)'}
          </button>
        ) : (
          <button
            type="button"
            disabled={executing}
            onClick={() => onExecute(display)}
            className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold py-2.5 text-sm transition-colors"
          >
            {executing ? 'Placing order…' : 'Execute better setup (manual)'}
          </button>
        )}
      </div>
      {orderFeedback}
    </div>
  );
}
