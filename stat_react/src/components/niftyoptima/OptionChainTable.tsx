import { useState } from 'react';
import type { OptionChainRow, OptionLeg } from '../../types/niftyoptima';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatLeg(
  leg: OptionLeg | undefined,
  kind: 'ltp' | 'oiChangePct' | 'volume'
): string {
  if (!leg) return '—';
  const v = leg[kind];
  if (v == null || !Number.isFinite(Number(v))) return '—';
  if (kind === 'ltp') return Number(v).toFixed(2);
  if (kind === 'oiChangePct') return Number(v).toFixed(1);
  return Math.floor(Number(v)).toLocaleString('en-IN');
}

function formatExpiry(iso?: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

type Props = {
  rows: OptionChainRow[];
  atm: number | null;
  /** YYYY-MM-DD — nearest NIFTY weekly series shown in this table. */
  expiry?: string | null;
  /** NIFTY spot used to price CE/PE (same as order book spot ref). */
  spotRef?: number | null;
  chainSource?: 'mstock' | 'sim' | 'none';
  chainIpBlocked?: boolean;
  chainNote?: string;
};

export function OptionChainTable({ rows, atm, expiry, spotRef, chainSource, chainNote }: Props) {
  const expiryLabel = formatExpiry(expiry);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState('');

  const retryLive = async () => {
    if (spotRef == null) return;
    setRetrying(true);
    setRetryMsg('');
    try {
      const res = await fetch(`${apiBase}/api/mstock/retry-option-chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spot: spotRef }),
      });
      const j = await res.json();
      if (j?.chainSource === 'mstock') {
        setRetryMsg('Live mStock prices loaded — refresh page if table unchanged.');
        window.dispatchEvent(new Event('mstock-auth-ok'));
      } else {
        setRetryMsg(j?.chainNote || j?.message || 'Still modelled — whitelist IP on trade.mstock.com');
      }
    } catch {
      setRetryMsg('Could not reach API server.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="rounded-xl border border-nox-line bg-nox-surface overflow-hidden">
      <div className="px-3 py-2 border-b border-nox-line flex flex-wrap justify-between items-center gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Option chain (ATM + strikes at/above spot)</p>
          {expiryLabel ? (
            <p className="text-[11px] text-nox-muted mt-0.5">
              CE &amp; PE for expiry{' '}
              <span className="text-amber-200/90">{expiryLabel}</span>
              <span className="text-nox-muted"> (NIFTY weekly · Tue)</span>
              {spotRef != null ? (
                <>
                  {' · '}
                  spot{' '}
                  <span className="text-white/80 tabular-nums">{spotRef.toFixed(2)}</span>
                </>
              ) : null}
              {chainSource === 'mstock' ? (
                <span className="text-emerald-400/90"> · Live mStock LTP</span>
              ) : chainSource === 'sim' ? (
                <span className="text-amber-200/80"> · Modelled (not broker LTP)</span>
              ) : null}
            </p>
          ) : null}
          {chainNote ? (
            <p className="text-[11px] text-amber-300/95 mt-1 leading-relaxed max-w-xl">{chainNote}</p>
          ) : null}
          {chainSource !== 'mstock' ? (
            <button
              type="button"
              disabled={retrying || spotRef == null}
              onClick={() => void retryLive()}
              className="mt-2 text-[11px] rounded-md border border-cyan-500/50 text-cyan-300 px-2 py-1 hover:bg-cyan-500/10 disabled:opacity-50"
            >
              {retrying ? 'Loading live CE/PE…' : 'Retry live mStock chain'}
            </button>
          ) : null}
          {retryMsg ? <p className="text-[11px] text-nox-muted mt-1">{retryMsg}</p> : null}
        </div>
        {spotRef != null ? (
          <span className="text-xs text-cyan-300">
            Spot {spotRef.toFixed(2)}
            <span className="text-nox-muted font-normal">
              {' '}
              · {rows[0]?.strike ?? atm ?? '—'} → {rows[rows.length - 1]?.strike ?? '—'}
            </span>
          </span>
        ) : atm != null ? (
          <span className="text-xs text-cyan-300">ATM {atm}</span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-nox-bg text-nox-muted text-left">
            <tr>
              <th className="px-2 py-2">Strike</th>
              <th className="px-2 py-2">CE LTP</th>
              <th className="px-2 py-2">CE ΔOI%</th>
              <th className="px-2 py-2">CE Vol</th>
              <th className="px-2 py-2">PE LTP</th>
              <th className="px-2 py-2">PE ΔOI%</th>
              <th className="px-2 py-2">PE Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-nox-muted text-xs">
                  Option chain loading… (CE/PE for selected expiry)
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.strike}
                  className={
                    r.strike === rows[0]?.strike || r.strike === atm ? 'bg-cyan-500/10' : ''
                  }
                >
                  <td className="px-2 py-2 font-mono text-white">{r.strike}</td>
                  <td className="px-2 py-2 font-mono text-emerald-200/90">{formatLeg(r.ce, 'ltp')}</td>
                  <td className="px-2 py-2 font-mono text-emerald-200/70">{formatLeg(r.ce, 'oiChangePct')}</td>
                  <td className="px-2 py-2 font-mono text-emerald-200/70">{formatLeg(r.ce, 'volume')}</td>
                  <td className="px-2 py-2 font-mono text-rose-200/90">{formatLeg(r.pe, 'ltp')}</td>
                  <td className="px-2 py-2 font-mono text-rose-200/70">{formatLeg(r.pe, 'oiChangePct')}</td>
                  <td className="px-2 py-2 font-mono text-rose-200/70">{formatLeg(r.pe, 'volume')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
