import type { StockSnapshot } from '../../types/equityStrategy';
import { buyLevelsForStock } from '../../hooks/useEquityBuy';

type Props = {
  stock: StockSnapshot;
  onBuy?: (stock: StockSnapshot) => void;
  onRemove?: (symbol: string) => void;
  buying?: boolean;
  /** watchlist = your added stocks; suggested = intraday buy picks only */
  variant?: 'watchlist' | 'suggested';
  rank?: number;
  rewardPct?: number;
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtVol(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function StockDetailCard({
  stock,
  onBuy,
  onRemove,
  buying,
  variant = 'watchlist',
  rank,
  rewardPct,
}: Props) {
  const a = stock.analysis;
  const q = stock.quote;
  const sr = stock.supportResistance;
  const pending = stock.source === 'pending' || stock.ltp <= 0;
  const levels = pending ? null : buyLevelsForStock(stock);
  const change = stock.dayChange ?? (q ? { points: q.changePts, percent: q.changePct, prevClose: q.prevClose } : null);
  const up = change != null && change.points >= 0;
  const isSuggested = variant === 'suggested';

  return (
    <article
      className={`rounded-xl border bg-nox-surface overflow-hidden w-full ${
        isSuggested
          ? 'border-emerald-500/40 ring-1 ring-emerald-500/20'
          : 'border-sky-500/20 ring-1 ring-sky-500/10'
      }`}
    >
      <div className="px-4 py-3 border-b border-nox-line flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {rank != null ? (
              <span className="text-xs font-bold text-amber-400 tabular-nums">#{rank}</span>
            ) : null}
            <h3 className="text-base font-semibold text-white">{stock.symbol}</h3>
            {isSuggested ? (
              <span className="text-[10px] uppercase px-2 py-0.5 rounded-full ring-1 text-emerald-400 bg-emerald-500/10 ring-emerald-400/40">
                Suggested buy
              </span>
            ) : (
              <span className="text-[10px] uppercase px-2 py-0.5 rounded-full ring-1 text-sky-300 bg-sky-500/10 ring-sky-400/40">
                My list
              </span>
            )}
            <span className="text-[10px] text-nox-muted">{stock.source}</span>
          </div>
          {stock.name && stock.name !== stock.symbol ? (
            <p className="text-xs text-nox-muted mt-0.5">{stock.name}</p>
          ) : null}
        </div>
        {!isSuggested && onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(stock.symbol)}
            className="text-xs text-nox-muted hover:text-rose-400"
          >
            Remove
          </button>
        ) : null}
      </div>

      <div
        className={
          isSuggested
            ? 'px-4 py-3 grid gap-3 sm:grid-cols-2'
            : 'px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-4 w-full'
        }
      >
        <div className={isSuggested ? '' : 'sm:min-w-[160px] shrink-0'}>
          <p className="text-xs text-nox-muted uppercase tracking-wide">Current price</p>
          <p className="text-2xl font-semibold text-white tabular-nums">
            {pending ? '—' : fmt(stock.ltp)}
          </p>
          {pending ? <p className="text-xs text-nox-muted animate-pulse">Fetching price…</p> : null}
          {change != null ? (
            <p className={`text-sm font-medium tabular-nums ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
              {up ? '+' : ''}
              {fmt(change.points)} ({up ? '+' : ''}
              {fmt(change.percent)}%)
            </p>
          ) : null}
        </div>

        <div
          className={
            isSuggested
              ? 'grid grid-cols-2 gap-x-4 gap-y-2 text-sm'
              : 'grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-4 gap-y-2 text-sm flex-1 w-full'
          }
        >
          <div>
            <p className="text-[10px] uppercase text-nox-muted">Open</p>
            <p className="text-white tabular-nums">{fmt(q?.dayOpen ?? null)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-nox-muted">Prev close</p>
            <p className="text-white tabular-nums">{fmt(q?.prevClose ?? change?.prevClose ?? null)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-emerald-400/80">Day high</p>
            <p className="text-emerald-300 tabular-nums font-medium">{fmt(q?.dayHigh ?? null)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-rose-400/80">Day low</p>
            <p className="text-rose-300 tabular-nums font-medium">{fmt(q?.dayLow ?? null)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-nox-muted">Volume</p>
            <p className="text-white tabular-nums">{fmtVol(q?.volume ?? null)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-nox-muted">RSI / VWAP</p>
            <p className="text-white tabular-nums text-xs">
              {a.rsi != null ? a.rsi.toFixed(1) : '—'} / {a.vwap != null ? fmt(a.vwap) : '—'}
            </p>
          </div>
          {a.relativeStrength != null ? (
            <div>
              <p className="text-[10px] uppercase text-sky-400/80">RS vs NIFTY</p>
              <p className="text-sky-300 tabular-nums font-medium text-xs">
                {a.relativeStrength >= 0 ? '+' : ''}
                {a.relativeStrength.toFixed(2)}%
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-[10px] uppercase text-cyan-400/80">Support</p>
            <p className="text-cyan-300 tabular-nums font-medium">{fmt(sr?.support ?? null)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-violet-400/80">Resistance</p>
            <p className="text-violet-300 tabular-nums font-medium">{fmt(sr?.resistance ?? null)}</p>
          </div>
        </div>
      </div>

      {isSuggested ? (
        <div className="px-4 py-2 bg-nox-bg/50 border-t border-nox-line grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="text-nox-muted">Purchase</p>
            <p className="text-sky-300 font-semibold tabular-nums">{fmt(levels?.entry ?? a.entry)}</p>
          </div>
          <div>
            <p className="text-nox-muted">Target</p>
            <p className="text-emerald-400 font-semibold tabular-nums">{fmt(levels?.tgt ?? a.tgt)}</p>
          </div>
          <div>
            <p className="text-nox-muted">Stop loss</p>
            <p className="text-rose-400 font-semibold tabular-nums">{fmt(levels?.sl ?? a.sl)}</p>
          </div>
        </div>
      ) : null}

      {isSuggested && a.rationale ? (
        <p className="px-4 py-2 text-[11px] text-emerald-200/80 border-t border-nox-line bg-emerald-500/5">
          {a.rationale}
        </p>
      ) : null}
      {isSuggested && a.factors.length > 0 ? (
        <p className="px-4 py-1.5 text-[10px] text-nox-muted border-t border-nox-line/50">
          {a.factors.join(' · ')}
        </p>
      ) : null}

      {isSuggested ? (
        <div className="px-4 py-3 border-t border-nox-line flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-amber-300">
            {`Confidence ${a.confidence}%${rewardPct != null ? ` · +${rewardPct.toFixed(1)}% target` : ''}`}
            {a.rr != null ? ` · R:R 1:${a.rr}` : ''}
          </span>
          <button
            type="button"
            disabled={buying || pending || !levels || stock.ltp <= 0 || !onBuy}
            onClick={() => onBuy?.(stock)}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buying ? 'Placing order…' : 'Buy now · 1 qty'}
          </button>
        </div>
      ) : null}

      {!isSuggested && !pending && a.rationale ? (
        <p
          className={`px-4 py-2 text-[11px] border-t border-nox-line/50 ${
            a.suggestPurchase ? 'text-emerald-300/90' : 'text-nox-muted'
          }`}
        >
          {a.suggestPurchase ? 'Suggested buy — see table above.' : a.rationale}
        </p>
      ) : null}

      {stock.error ? <p className="px-4 pb-2 text-[11px] text-amber-300">{stock.error}</p> : null}
    </article>
  );
}
