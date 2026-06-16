import { useEffect, useRef, useState } from 'react';
import type { StockSnapshot } from '../../types/equityStrategy';

type Props = {
  stock: StockSnapshot | null;
  placing?: boolean;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
};

function parseQuantity(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 9999) return null;
  return n;
}

export function EquityBuyQuantityDialog({ stock, placing, onClose, onConfirm }: Props) {
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!stock) return;
    setQty('1');
    setError(null);
    const t = window.setTimeout(() => inputRef.current?.select(), 0);
    return () => window.clearTimeout(t);
  }, [stock]);

  if (!stock) return null;

  function submit() {
    const n = parseQuantity(qty);
    if (n == null) {
      setError('Enter a whole number from 1 to 9999');
      return;
    }
    setError(null);
    onConfirm(n);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={placing ? undefined : onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-labelledby="equity-buy-qty-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl border border-emerald-500/30 bg-nox-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-emerald-500/20 bg-emerald-500/5">
          <h2 id="equity-buy-qty-title" className="text-sm font-semibold text-emerald-400">
            Buy {stock.symbol}
          </h2>
          <p className="text-xs text-nox-muted mt-0.5">Enter quantity for this intraday buy order</p>
        </div>

        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-xs text-nox-muted">Quantity</span>
            <input
              ref={inputRef}
              type="number"
              min={1}
              max={9999}
              step={1}
              value={qty}
              disabled={placing}
              onChange={(e) => {
                setQty(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') onClose();
              }}
              className="mt-1 w-full rounded-lg border border-nox-line bg-nox-bg px-3 py-2 text-sm text-white tabular-nums focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 disabled:opacity-50"
              autoFocus
            />
          </label>
          {error ? <p className="text-xs text-rose-400">{error}</p> : null}
          <p className="text-[11px] text-nox-muted">
            LTP {stock.ltp > 0 ? stock.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
          </p>
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            type="button"
            disabled={placing}
            onClick={onClose}
            className="flex-1 rounded-lg border border-nox-line px-3 py-2 text-xs font-medium text-nox-muted hover:bg-nox-bg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={placing}
            onClick={submit}
            className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
          >
            {placing ? 'Placing…' : 'Place buy order'}
          </button>
        </div>
      </div>
    </div>
  );
}
