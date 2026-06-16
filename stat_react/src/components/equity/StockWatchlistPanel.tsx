import { useEffect, useRef, useState } from 'react';
import { useEquitySymbolSearch } from '../../hooks/useEquitySymbolSearch';
import { parseStockListFile } from '../../lib/parseStockList';

type Props = {
  symbols: string[];
  onAdd: (symbol: string) => Promise<unknown>;
  onRemove: (symbol: string) => Promise<unknown>;
  onImport?: (symbols: string[]) => Promise<{ added: number; skipped: number; total: number }>;
  onAnalyze?: () => void;
  analyzing?: boolean;
};

export function StockWatchlistPanel({ symbols, onAdd, onRemove, onImport, onAnalyze, analyzing }: Props) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { suggestions, loading } = useEquitySymbolSearch(input);
  const filtered = suggestions.filter((s) => !symbols.includes(s.symbol));

  useEffect(() => {
    const has = input.trim().length > 0 && suggestions.some((s) => !symbols.includes(s.symbol));
    setOpen(has);
    setActiveIdx(-1);
  }, [input, suggestions, symbols]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function addSymbol(sym: string) {
    const normalized = sym.trim().toUpperCase().replace(/\.NS$|\.BO$/i, '');
    if (!normalized) return;
    if (symbols.includes(normalized)) {
      setMsg(`${normalized} is already in your list`);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await onAdd(normalized);
      setInput('');
      setOpen(false);
      setMsg(`Added ${normalized} — analyzing for intraday buy…`);
      onAnalyze?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (activeIdx >= 0 && filtered[activeIdx]) {
      await addSymbol(filtered[activeIdx].symbol);
      return;
    }
    await addSymbol(input);
  }

  function selectSuggestion(symbol: string) {
    void addSymbol(symbol);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !filtered.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  async function handleRemove(sym: string) {
    setBusy(true);
    setMsg(null);
    try {
      await onRemove(sym);
      onAnalyze?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImport) return;

    setBusy(true);
    setMsg(null);
    try {
      const parsed = await parseStockListFile(file);
      if (!parsed.length) {
        setMsg('No valid stock symbols found in file');
        return;
      }
      const result = await onImport(parsed);
      const parts = [`Added ${result.added} stock${result.added === 1 ? '' : 's'}`];
      if (result.skipped > 0) {
        parts.push(`${result.skipped} already in list`);
      }
      setMsg(`${parts.join(' · ')} — analyzing…`);
      onAnalyze?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-nox-line bg-nox-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Add stock</h2>
          <p className="text-xs text-nox-muted">
            Type a name — attached stocks show in Your stock list below
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-nox-muted">{symbols.length} stock{symbols.length === 1 ? '' : 's'}</span>
          {onAnalyze && symbols.length > 0 ? (
            <button
              type="button"
              disabled={analyzing || busy}
              onClick={() => onAnalyze()}
              className="rounded-lg bg-sky-500/20 px-3 py-1.5 text-xs font-medium text-sky-300 ring-1 ring-sky-400/50 hover:bg-sky-500/30 disabled:opacity-50"
            >
              {analyzing ? 'Analyzing…' : 'Analyze list'}
            </button>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 mb-3">
        <div ref={wrapRef} className="relative flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onFocus={() => input.trim() && filtered.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Type stock name — RELIANCE, TCS…"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            className="w-full rounded-lg border border-nox-line bg-nox-bg px-3 py-2 text-sm text-white placeholder:text-nox-muted focus:outline-none focus:ring-1 focus:ring-sky-400/60"
            disabled={busy}
          />
          {loading && input.trim() ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-nox-muted">
              …
            </span>
          ) : null}
          {open ? (
            <ul
              role="listbox"
              className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-auto rounded-lg border border-nox-line bg-nox-bg shadow-xl"
            >
              {filtered.map((s, i) => (
                <li key={s.symbol} role="option" aria-selected={i === activeIdx}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(s.symbol)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-baseline gap-2 ${
                      i === activeIdx
                        ? 'bg-sky-500/20 text-white'
                        : 'text-white hover:bg-nox-surface'
                    }`}
                  >
                    <span className="font-semibold text-sky-300">{s.symbol}</span>
                    <span className="text-xs text-nox-muted truncate">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {input.trim() && !loading && !open && suggestions.length === 0 ? (
            <p className="absolute z-20 left-0 right-0 mt-1 text-xs text-nox-muted px-2 py-1 rounded bg-nox-bg border border-nox-line">
              No matches — press Add to try &quot;{input.trim().toUpperCase()}&quot;
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300 ring-1 ring-emerald-400/50 hover:bg-emerald-500/30 disabled:opacity-50 shrink-0"
        >
          Add stock
        </button>
        {onImport ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(e) => void handleFileUpload(e)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-violet-500/20 px-4 py-2 text-sm font-medium text-violet-300 ring-1 ring-violet-400/50 hover:bg-violet-500/30 disabled:opacity-50 shrink-0"
            >
              Upload list
            </button>
          </>
        ) : null}
      </form>

      {onImport ? (
        <p className="text-[11px] text-nox-muted mb-2">
          Upload a .csv or .txt file — one symbol per line, or comma-separated. Existing stocks are kept.
        </p>
      ) : null}

      {msg ? <p className="text-xs text-nox-muted mb-2">{msg}</p> : null}

      {symbols.length === 0 ? (
        <p className="text-sm text-nox-muted rounded-lg bg-nox-bg px-3 py-4 ring-1 ring-nox-line">
          No stocks attached yet. Start typing above to see suggestions, then add to your list.
        </p>
      ) : null}
    </section>
  );
}
