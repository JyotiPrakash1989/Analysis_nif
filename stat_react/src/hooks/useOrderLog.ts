import { useCallback, useEffect, useState } from 'react';
import { ORDER_LOG_EVENT } from '../lib/orderLogBus';
import type { OrderLogEntry } from '../types/niftyoptima';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';
export const ORDER_LOG_CLEARED_EVENT = 'niftyoptima-order-log-cleared';

export function useOrderLog(pollMs = 3000, dayParam?: string) {
  const [logs, setLogs] = useState<OrderLogEntry[]>([]);
  const [day, setDay] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const q = dayParam ? `?day=${encodeURIComponent(dayParam)}` : '';
      const res = await fetch(`${apiBase}/api/orders/log${q}`);
      if (!res.ok) return;
      const j = (await res.json()) as { day?: string; logs?: OrderLogEntry[]; autoTrading?: boolean };
      setDay(j.day ?? '');
      setLogs(Array.isArray(j.logs) ? j.logs : []);
    } catch {
      /* keep prior */
    } finally {
      setLoading(false);
    }
  }, [dayParam]);

  const appendFromSocket = useCallback(
    (row: OrderLogEntry) => {
      if (dayParam && row.dayKey !== dayParam) return;
      setLogs((prev) => {
        const rowKey = `${row.action}-${row.orderId ?? row.id}`;
        if (prev.some((r) => `${r.action}-${r.orderId ?? r.id}` === rowKey)) return prev;
        return [...prev, row].sort((a, b) => (a.ts || 0) - (b.ts || 0));
      });
    },
    [dayParam]
  );

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, pollMs);
    return () => window.clearInterval(id);
  }, [refresh, pollMs]);

  useEffect(() => {
    const onPush = (event: Event) => {
      const row = (event as CustomEvent<OrderLogEntry>).detail;
      if (row) appendFromSocket(row);
    };
    const onCleared = (event: Event) => {
      const clearedDay = (event as CustomEvent<{ day?: string }>).detail?.day;
      if (dayParam && clearedDay && clearedDay !== dayParam) return;
      void refresh();
    };
    window.addEventListener(ORDER_LOG_EVENT, onPush);
    window.addEventListener(ORDER_LOG_CLEARED_EVENT, onCleared);
    return () => {
      window.removeEventListener(ORDER_LOG_EVENT, onPush);
      window.removeEventListener(ORDER_LOG_CLEARED_EVENT, onCleared);
    };
  }, [appendFromSocket, dayParam, refresh]);

  const clear = useCallback(async (targetDay?: string) => {
    const key = targetDay ?? dayParam ?? day;
    const q = key ? `?day=${encodeURIComponent(key)}` : '';
    const res = await fetch(`${apiBase}/api/orders/log${q}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Clear failed (HTTP ${res.status})`);
    }
    const j = (await res.json()) as { day?: string; logs?: OrderLogEntry[] };
    const clearedDay = j.day ?? key;
    setDay(clearedDay);
    setLogs([]);
    window.dispatchEvent(
      new CustomEvent(ORDER_LOG_CLEARED_EVENT, { detail: { day: clearedDay } })
    );
    return j;
  }, [dayParam, day]);

  return { logs, day, loading, refresh, appendFromSocket, clear };
}

export function exportOrdersExcelUrl(day?: string) {
  const q = day ? `?day=${encodeURIComponent(day)}` : '';
  return `${apiBase}/api/orders/export${q}`;
}
