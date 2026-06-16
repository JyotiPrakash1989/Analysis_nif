import { useMemo, useState } from 'react';
import { mergeWatchlistStocks } from '../../lib/mergeWatchlistStocks';
import type { StockSnapshot } from '../../types/equityStrategy';
import { StockDetailCard } from './StockDetailCard';

function matchesStockSearch(stock: StockSnapshot, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const symbol = stock.symbol.toLowerCase();
  const name = (stock.name ?? '').toLowerCase();
  return symbol.includes(q) || name.includes(q);
}

type Props = {
  symbols: string[];
  stocks: StockSnapshot[];
  loading?: boolean;
  onRemove: (symbol: string) => void;
};

export function WatchlistStocksSection({
  symbols,
  stocks,
  loading,
  onRemove,
}: Props) {
  const [search, setSearch] = useState('');
  const attached = useMemo(() => mergeWatchlistStocks(symbols, stocks), [symbols, stocks]);
  const filtered = useMemo(
    () => attached.filter((stock) => matchesStockSearch(stock, search)),
    [attached, search]
  );
  const searching = search.trim().length > 0;

  if (!symbols.length) {
    return (
      <section className="rounded-xl border border-sky-500/20 bg-nox-surface/50 p-4">
        <h2 className="text-sm font-semibold text-sky-300">Your stock list</h2>
        <p className="text-xs text-nox-muted mt-1">Attached stocks appear here with live price, high and low.</p>
        <p className="text-sm text-nox-muted mt-4 rounded-lg bg-nox-bg px-3 py-4 ring-1 ring-nox-line">
          No stocks attached yet. Add symbols above — the intraday strategy runs only on your list.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-sky-500/25 bg-nox-surface/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-sky-500/20 bg-sky-500/5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-sky-300">Your stock list</h2>
          <p className="text-xs text-nox-muted">
            {searching
              ? `Showing ${filtered.length} of ${symbols.length} stock${symbols.length === 1 ? '' : 's'}`
              : `${symbols.length} stock${symbols.length === 1 ? '' : 's'} — sorted by % change (gainers top)`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-1 sm:flex-none sm:min-w-[220px]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value.toUpperCase())}
            placeholder="Search list…"
            aria-label="Search stock list"
            className="w-full rounded-lg border border-nox-line bg-nox-bg px-3 py-1.5 text-sm text-white placeholder:text-nox-muted focus:outline-none focus:ring-1 focus:ring-sky-400/60"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-xs text-nox-muted hover:text-white shrink-0"
            >
              Clear
            </button>
          ) : null}
        </div>
        {loading ? <span className="text-xs text-nox-muted animate-pulse">Updating…</span> : null}
      </div>

      <div className="p-4 flex flex-col gap-4 w-full">
        {filtered.length === 0 ? (
          <p className="text-sm text-nox-muted rounded-lg bg-nox-bg px-3 py-4 ring-1 ring-nox-line text-center">
            {searching
              ? `No stocks match "${search.trim()}".`
              : 'No stocks to show.'}
          </p>
        ) : (
          filtered.map((stock) => (
            <StockDetailCard
              key={stock.symbol}
              stock={stock}
              variant="watchlist"
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </section>
  );
}
