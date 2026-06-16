import { formatPremium } from '../../lib/signalLevels';
import type { PlacedOrderDetails } from '../../types/niftyoptima';

type Props = {
  order: PlacedOrderDetails;
  onCancel: () => void;
  cancelling: boolean;
  cancelError?: string | null;
  cancelOk?: string | null;
};

function statusLabel(status: string) {
  const s = status.toLowerCase();
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  if (s === 'simulated') return 'Simulated';
  if (s === 'submitted') return 'Open / submitted';
  return status;
}

export function PlacedOrderPanel({ order, onCancel, cancelling, cancelError, cancelOk }: Props) {
  const cancelled =
    order.status === 'cancelled' || order.status === 'canceled';
  const canCancel = !cancelled;

  const handleCancelClick = () => {
    if (order.mock) {
      const ok = window.confirm('Remove this simulated order from the app?');
      if (ok) onCancel();
      return;
    }
    const ok = window.confirm(
      `Cancel this order on mStock?\n\n` +
        `Order ID: ${order.orderId}\n` +
        `NIFTY ${order.strike} ${order.optionType} · ${order.lots} lot (${order.units} qty)\n` +
        `Entry ${formatPremium(order.entry)}`
    );
    if (ok) onCancel();
  };

  return (
    <div className="rounded-lg border border-cyan-500/40 bg-nox-bg/80 p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-white font-semibold text-sm">Order details</p>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${
            cancelled
              ? 'bg-nox-muted/20 text-nox-muted'
              : order.mock
                ? 'bg-amber-500/20 text-amber-200'
                : 'bg-emerald-500/20 text-emerald-300'
          }`}
        >
          {statusLabel(order.status)}
        </span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
        <dt className="text-nox-muted">Order ID</dt>
        <dd className="font-mono text-white break-all">{order.orderId}</dd>

        <dt className="text-nox-muted">Symbol</dt>
        <dd className="font-mono text-white">
          NIFTY {order.strike} {order.optionType}
        </dd>

        {order.tradingsymbol ? (
          <>
            <dt className="text-nox-muted">Contract</dt>
            <dd className="font-mono text-slate-300 break-all">{order.tradingsymbol}</dd>
          </>
        ) : null}

        <dt className="text-nox-muted">Quantity</dt>
        <dd className="font-mono text-white">
          {order.lots} lot{order.lots !== 1 ? 's' : ''} ({order.units} qty · lot {order.lotsize})
        </dd>

        <dt className="text-nox-muted">Entry</dt>
        <dd className="font-mono text-white">{formatPremium(order.entry)}</dd>

        <dt className="text-nox-muted">Stop-loss</dt>
        <dd className="font-mono text-rose-300">{formatPremium(order.sl)}</dd>

        <dt className="text-nox-muted">Target</dt>
        <dd className="font-mono text-emerald-300">{formatPremium(order.tgt)}</dd>

        {order.bracketStoploss ? (
          <>
            <dt className="text-nox-muted">Bracket SL</dt>
            <dd className="font-mono text-rose-200/90">{order.bracketStoploss} pts on buy</dd>
          </>
        ) : null}

        {order.stopLossSellOrderId ? (
          <>
            <dt className="text-nox-muted">SL order</dt>
            <dd className="font-mono text-rose-200 break-all">
              STOPLOSS_LIMIT @ {formatPremium(order.sl)}
              {order.stopLossSellOk === false ? ' (failed)' : ''}
              <span className="block text-[10px] text-nox-muted mt-0.5">{order.stopLossSellOrderId}</span>
            </dd>
          </>
        ) : null}

        {order.targetSellOrderId ? (
          <>
            <dt className="text-nox-muted">Target sell</dt>
            <dd className="font-mono text-cyan-200 break-all">
              LIMIT @ {formatPremium(order.tgt)}
              {order.targetSellOk === false ? ' (failed)' : ''}
              <span className="block text-[10px] text-nox-muted mt-0.5">{order.targetSellOrderId}</span>
            </dd>
          </>
        ) : null}

        {order.exchange ? (
          <>
            <dt className="text-nox-muted">Exchange</dt>
            <dd className="text-white">{order.exchange}</dd>
          </>
        ) : null}

        {order.producttype ? (
          <>
            <dt className="text-nox-muted">Product</dt>
            <dd className="text-white">{order.producttype}</dd>
          </>
        ) : null}

        {order.orderType ? (
          <>
            <dt className="text-nox-muted">Order type</dt>
            <dd className="text-white">{order.orderType}</dd>
          </>
        ) : null}

        <dt className="text-nox-muted">Placed at</dt>
        <dd className="text-white">{new Date(order.placedAt).toLocaleTimeString()}</dd>
      </dl>

      {order.mock ? (
        <p className="text-[11px] text-amber-200/90">
          Simulated order — cancel only updates this app (not mStock).
        </p>
      ) : null}

      {cancelError ? (
        <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded px-2 py-1.5">
          {cancelError}
        </p>
      ) : null}

      {cancelOk ? (
        <p className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded px-2 py-1.5">
          {cancelOk}
        </p>
      ) : null}

      <button
        type="button"
        disabled={cancelling || cancelled || !canCancel}
        onClick={handleCancelClick}
        className="w-full rounded-lg border border-rose-500/60 bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-rose-200 font-semibold py-2 text-sm transition-colors"
      >
        {cancelling
          ? 'Cancelling…'
          : cancelled
            ? 'Order cancelled'
            : order.mock
              ? 'Dismiss simulated order'
              : 'Cancel order'}
      </button>
    </div>
  );
}
